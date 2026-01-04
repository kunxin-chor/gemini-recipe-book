require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

function removeCodeFence(text) {
    return text.replace(/```json/g, '').replace(/```/g, '');
}

async function generateSearchParams(query, tags, cuisines, ingredients) {
    const systemPrompt = `You are a recipe search query converter. Convert the user's natural language query into a structured search format.

Available tags: ${tags.join(', ')}
Available cuisines: ${cuisines.join(', ')}
Available ingredients: ${ingredients.join(', ')}

Output a JSON object withA ALL the following fields, using only the values from the available lists and empty arrays if no values apply:
{
  "cuisine": string[],
  "tags": string[],
  "ingredients": string[] 
}

- tags: array of strings of matching tags (OR logic - recipe has ANY of these)
- cuisines: array of cuisine names (OR logic - recipe has ANY of these)
- ingredients: array of string of ingredients (AND logic - recipe must have ALL of these)

Rules:
- Only use tags from the available tags list
- Only use cuisines from the available cuisines list
- For ingredients, extract and infer any food items mentioned
- Keep values lowercase
- Omit fields that don't apply to the query
- Return ONLY valid JSON, no explanation with no code fences


Semantic understanding - infer meaning from natural language and apply it to tags, cuisines and ingredients.
Use association to infer cuisines and ingredients.
- If the query mentions a cuisine, infer the cuisine or the closest match from the available cuisines list.
- If the query mentions an ingredient, infer the ingredient or the closest match from the available ingredients list.
- If the query mentions a tag, infer the tag or the closest match from the available tags list.


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
        config: {
            responseMimeType: "application/json",
            responseJsonSchema: {
                type: "object",
                properties: {
                    cuisines: {
                        type: "array",
                        items: { type: "string" }
                    },
                    tags: {
                        type: "array",
                        items: { type: "string" }
                    },
                    ingredients: {
                        type: "array",
                        items: { type: "string" }
                    }
                },
                required: ["cuisines", "tags", "ingredients"]
            }
        }
    });

    const searchParams = JSON.parse(aiResponse.text);
    return searchParams;
}

module.exports = {
    ai, MODEL, generateSearchParams
}