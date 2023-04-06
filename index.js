
"use strict"

// Import required packages
const express = require('express');
const mssql = require('mssql');
const csv = require('csv-parser');
const fs = require('fs');
const multer = require('multer');


// replace the config in your index.js 
const config = {
  user: 'xxxx',
  password: 'xxxx',
  server: 'xxxx', // e.g. 'localhost'
  database: 'xxxx',
  options: {
      encrypt: true, // For secure connection
      trustServerCertificate: true,
  }
};
// Create an Express app
const app = express();

// Set up the view engine to use EJS
app.set('view engine', 'ejs');

// Set up middleware for handling file uploads
const upload = multer({ dest: 'uploads/' });

// Define a route for rendering the form
app.get('/', (req, res) => {
  res.render('index');
});

// Define a route for handling form submissions
app.post('/', upload.single('csvFile'), async (req, res) => {
  // console.log('req',req.body);
  try {
    // Parse the CSV file
    const results = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          // Remove the temporary file
          fs.unlinkSync(req.file.path);
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        });
    });

    // Extract the column names from the CSV file
    const columns = Object.keys(results[0]);

    // Check if the table already exists
    const tableName = req.body.tableName;
    const pool = await mssql.connect(config);
    const tableExists = await pool.request().query(`SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tableName}'`);
    if (tableExists.recordset.length > 0) {
      // If the table already exists, render an error message
      res.send(`Table ${tableName} already exists.`);
      console.log(`Table ${tableName} already exists.`);
      return;
    }

    // Generate the SQL queries for creating the table and inserting the data
    const createTableQuery = `CREATE TABLE ${tableName} ( 
      Id INT IDENTITY(1,1),
      ${columns.map((column) => `[${column}] VARCHAR(MAX)`).join(', ')}
    )`;

    const insertDataQuery = `INSERT INTO ${tableName} (${columns.map((column) => `[${column}]`).join(', ')}) VALUES `;
    
    // Execute the create table query
    await pool.request().query(createTableQuery);

    // Batch insert the data
    const batchSize = 50;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const batchValues = batch.map((row) => `(${columns.map((column) => `'${row[column]}'`).join(', ')})`).join(', ');
      await pool.request().query(`${insertDataQuery} ${batchValues}`);
    }

    // Close the database connection
    mssql.close();

    // Render a success message
    // console.log('req',req.body);
    res.send('success');
    console.log('success');
  } catch (error) {
    console.error(error);
    res.send('error');
  }
});


//Start the server
app.listen(3000, () => {
  console.log("Server started on port 3000");
});
