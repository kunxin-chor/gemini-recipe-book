// 1. SETUP EXPRESS
const express = require('express');
const cors = require("cors");
require("dotenv").config();
const { ObjectId } = require("mongodb");

const { connect } = require('./db');
const dbname = "recipe_book";
const mongoUri = process.env.MONGO_URI;


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

}

main();
// 3. START SERVER (Don't put any routes after this line)
app.listen(3000, function () {
    console.log("Server has started");
})