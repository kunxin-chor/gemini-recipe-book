// 1. SETUP EXPRESS
const express = require('express');

// 1a. create the app
const app = express();
app.use(express.json())

// 2. CREATE ROUTES
app.get('/', function(req,res){
    res.json({
     "message":"Hello World!"
   });
})  

// 3. START SERVER (Don't put any routes after this line)
app.listen(3000, function(){
    console.log("Server has started");
})