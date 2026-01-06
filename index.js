// 1. SETUP EXPRESS
const express = require('express');
const cors = require("cors");
require("dotenv").config();
const { ObjectId } = require("mongodb");

const { connect } = require('./db');
const dbname = "recipe_book";
const mongoUri = process.env.MONGO_URI;

// GEMINI AI
const { ai, MODEL, generateSearchParams, generateRecipe } = require('./gemini');

// 1a. create the app
const app = express();
app.use(express.json())
app.use(cors());

// 2. CREATE ROUTES
function buildRecipeSearchQuery(searchParams) {
    const query = {};

    if (searchParams.tags && searchParams.tags.length > 0) {
        query['tags.name'] = { $in: searchParams.tags };
    }

    if (searchParams.cuisines && searchParams.cuisines.length > 0) {
        query['cuisine.name'] = { $in: searchParams.cuisines.map(c => new RegExp(c, 'i')) };
    }

    if (searchParams.ingredients && searchParams.ingredients.length > 0) {
        query['ingredients.name'] = { $all: searchParams.ingredients.map(i => new RegExp(i, 'i')) };
    }

    if (searchParams.name) {
        query.name = { $regex: searchParams.name, $options: 'i' };
    }

    return query;
}

async function main() {
    const db = await connect(mongoUri, dbname);

    // Routes

    app.get('/recipes', async (req, res) => {
        try {
            const { tags, cuisines, ingredients, name } = req.query;

            const searchParams = {
                tags: tags ? tags.split(',') : [],
                cuisines: cuisines ? cuisines.split(',') : [],
                ingredients: ingredients ? ingredients.split(',') : [],
                name: name || ''
            };

            const query = buildRecipeSearchQuery(searchParams);

            const recipes = await db.collection('recipes').find(query).project({
                name: 1,
                'cuisine.name': 1,
                'tags.name': 1,
                _id: 0
            }).toArray();

            res.json({ recipes });
        } catch (error) {
            console.error('Error searching recipes:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.get("/recipes/:id", async (req, res) => {
        try {
            const id = req.params.id;

            // First, fetch the recipe
            const recipe = await db.collection("recipes").findOne(
                { _id: new ObjectId(id) },
                { projection: { _id: 0 } }
            );

            if (!recipe) {
                return res.status(404).json({ error: "Recipe not found" });
            }

            res.json(recipe);
        } catch (error) {
            console.error("Error fetching recipe:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    app.get('/ai/recipes', async function (req, res) {
        try {
            const { query } = req.query;

            const allTags = await db.collection('tags').distinct('name');
            const allCuisines = await db.collection('cuisines').distinct('name');
            const ingredients = await db.collection('ingredients').distinct('name');

            const searchParams = await generateSearchParams(query, allTags, allCuisines, ingredients);
            const mongoQuery = buildRecipeSearchQuery(searchParams);


            const recipes = await db.collection('recipes').find(mongoQuery).project({
                name: 1,
                'cuisine.name': 1,
                'tags.name': 1,
                _id: 0
            }).toArray();

            res.json({ searchParams, recipes });
        } catch (error) {
            console.error('Error converting query:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    })

    app.post('/recipes', async (req, res) => {
        try {
            const { name, cuisine, prepTime, cookTime, servings, ingredients, instructions, tags } = req.body;

            // Basic validation
            if (!name || !cuisine || !ingredients || !instructions || !tags) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Fetch the cuisine document
            const cuisineDoc = await db.collection('cuisines').findOne({ name: cuisine });
            if (!cuisineDoc) {
                return res.status(400).json({ error: 'Invalid cuisine' });
            }

            // Fetch the tag documents
            const tagDocs = await db.collection('tags').find({ name: { $in: tags } }).toArray();
            if (tagDocs.length !== tags.length) {
                return res.status(400).json({ error: 'One or more invalid tags' });
            }

            // Create the new recipe object
            const newRecipe = {
                name,
                cuisine: {
                    _id: cuisineDoc._id,
                    name: cuisineDoc.name
                },
                prepTime,
                cookTime,
                servings,
                ingredients,
                instructions,
                tags: tagDocs.map(tag => ({
                    _id: tag._id,
                    name: tag.name
                }))
            };

            // Insert the new recipe into the database
            const result = await db.collection('recipes').insertOne(newRecipe);

            // Send back the created recipe
            res.status(201).json({
                message: 'Recipe created successfully',
                recipeId: result.insertedId
            });
        } catch (error) {
            console.error('Error creating recipe:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.post('/ai/recipe', async (req, res) => {
        try {
            const { recipeText } = req.body;

            if (!recipeText) {
                return res.status(400).json({ error: 'Recipe text is required' });
            }

            // Get available cuisines and tags
            const availableCuisines = await db.collection('cuisines').distinct('name');
            const availableTags = await db.collection('tags').distinct('name');

            // Generate structured recipe from natural language
            const parsedRecipe = await generateRecipe(recipeText, availableCuisines, availableTags);

            // Validate that the AI-generated cuisine exists
            const cuisineDoc = await db.collection('cuisines').findOne({ name: parsedRecipe.cuisine });
            if (!cuisineDoc) {
                return res.status(400).json({ 
                    error: 'AI generated invalid cuisine',
                    generatedCuisine: parsedRecipe.cuisine,
                    parsedRecipe 
                });
            }

            // Validate that all AI-generated tags exist
            const tagDocs = await db.collection('tags').find({ name: { $in: parsedRecipe.tags } }).toArray();
            
            if (tagDocs.length !== parsedRecipe.tags.length) {
                return res.status(400).json({ 
                    error: 'AI generated invalid tags',
                    parsedRecipe 
                });
            }

            // Create the new recipe object
            const newRecipe = {
                name: parsedRecipe.name,
                cuisine: {
                    _id: cuisineDoc._id,
                    name: cuisineDoc.name
                },
                prepTime: parsedRecipe.prepTime,
                cookTime: parsedRecipe.cookTime,
                servings: parsedRecipe.servings,
                ingredients: parsedRecipe.ingredients,
                instructions: parsedRecipe.instructions,
                tags: tagDocs.map(tag => ({
                    _id: tag._id,
                    name: tag.name
                }))
            };

            // Insert the new recipe into the database
            const result = await db.collection('recipes').insertOne(newRecipe);

            // Send back the created recipe
            res.status(201).json({
                message: 'Recipe created successfully from AI',
                recipeId: result.insertedId,
                parsedRecipe: parsedRecipe
            });
        } catch (error) {
            console.error('Error creating AI recipe:', error);
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    });

}

main();
// 3. START SERVER (Don't put any routes after this line)
app.listen(3000, function () {
    console.log("Server has started");
})