// 1. SETUP EXPRESS
const express = require('express');
const cors = require("cors");
require("dotenv").config();
const { ObjectId } = require("mongodb");

const { connect } = require('./db');
const dbname = "recipe_book";
const mongoUri = process.env.MONGO_URI;

// GEMINI AI
const { ai, MODEL } = require('./gemini');

// 1a. create the app
const app = express();
app.use(express.json())
app.use(cors());

// 2. CREATE ROUTES
async function main() {
    const db = await connect(mongoUri, dbname);

    // Routes

    app.get('/recipes', async (req, res) => {
        try {
            const { tags, cuisine, ingredients, name } = req.query;
            let query = {};

            if (tags) {
                query['tags.name'] = { $in: tags.split(',') };
            }

            if (cuisine) {
                query['cuisine.name'] = { $regex: cuisine, $options: 'i' };
            }

            if (ingredients) {
                query['ingredients.name'] = { $all: ingredients.split(',').map(i => new RegExp(i, 'i')) };
            }

            if (name) {
                query.name = { $regex: name, $options: 'i' };
            }

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

    app.get('/ai/recipes', async function(req, res){
        try {
            const { query } = req.query;
            
            const allTags = await db.collection('tags').distinct('name');
            const allCuisines = await db.collection('cuisines').distinct('name');

            const systemPrompt = `You are a recipe search query converter. Convert the user's natural language query into a structured search format.

Available tags: ${allTags.join(', ')}
Available cuisines: ${allCuisines.join(', ')}

Output a JSON object with the following fields, using only the values from the available lists and empty arrays if no values apply:
- tags: array of strings of matching tags (OR logic - recipe has ANY of these)
- cuisines: array of cuisine names (OR logic - recipe has ANY of these)
- ingredients: array of string of ingredients (AND logic - recipe must have ALL of these)

Rules:
- Only use tags from the available tags list
- Only use cuisines from the available cuisines list
- For ingredients, extract any food items mentioned
- Keep values lowercase
- Omit fields that don't apply to the query
- Return ONLY valid JSON, no explanation with no code fences

Semantic understanding - infer meaning from natural language and apply it to tags, cuisine and ingredients


Example input: "italian pasta with chicken and garlic"
Example output: {"cuisines":["italian"],"ingredients":["chicken","garlic"]}

Example input: "southeast asian recipes"
Example output: {"tags":["thai","vietnamese","chinese","indian"]}

Example input: "quick no meat dinner"
Example output: {"tags":["quick","easy","vegetarian","vegan","dinner"]}

Example input: "healthy thai soup with coconut and lemongrass"
Example output: {"cuisines":["thai"],"ingredients":["coconut","lemongrass"],"tags":["healthy","light"]}`;

            const aiResponse = await ai.models.generateContent({
                model: MODEL,
                contents: systemPrompt + '\n\nUser query: ' + query,
                responseMimeType: "application/json"
            });

            const searchParams = JSON.parse(aiResponse.text);
            res.json({ searchParams });
            
        } catch (error) {
            console.error('Error converting query:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    })

}

main();
// 3. START SERVER (Don't put any routes after this line)
app.listen(3000, function () {
    console.log("Server has started");
})