const { MongoClient, ServerApiVersion } = require('mongodb');

let client = null;

async function connect(uri, dbName) {
  if (client) {
    return client;
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  console.log('Connected to MongoDB');
  
  return client.db(dbName);
}

module.exports = { connect  };
