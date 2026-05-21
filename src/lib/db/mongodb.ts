import { MongoClient, Db, MongoClientOptions } from "mongodb";

/**
 * MongoDB Connection Manager
 * Parametric configuration via environment variables
 * No hardcoded localhost dependency
 */

interface MongoConfig {
  uri: string;
  dbName: string;
}

const config: MongoConfig = {
  uri: process.env.MONGODB_URI || "mongodb://localhost:27017/chorono",
  dbName: "chorono",
};

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Connect to MongoDB
 * Reuses connection in dev mode (hot reload)
 */
export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    console.log("✓ Using cached MongoDB connection");
    return { client: cachedClient, db: cachedDb };
  }

  try {
    const options: MongoClientOptions = {
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true,
    };

    console.log(`Connecting to MongoDB: ${config.uri.split("@")[1] || config.uri}`);

    const client = new MongoClient(config.uri, options);
    await client.connect();

    const db = client.db(config.dbName);

    // Verify connection
    const adminDb = client.db("admin");
    await adminDb.command({ ping: 1 });
    console.log("✓ MongoDB connection successful");

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (err) {
    console.error("✗ MongoDB connection failed:", err);
    throw err;
  }
}

/**
 * Get database instance (assumes connected)
 */
export async function getDatabase(): Promise<Db> {
  if (cachedDb) return cachedDb;

  const { db } = await connectToDatabase();
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    console.log("✓ MongoDB connection closed");
  }
}

/**
 * Initialize collections and indexes
 * Call this once on app startup
 */
export async function initializeCollections(): Promise<void> {
  const db = await getDatabase();

  // Ensure scenes collection exists with indexes
  try {
    const collectionsResult = await db.listCollections({ name: "scenes" }).toArray();

    if (collectionsResult.length === 0) {
      console.log("Creating 'scenes' collection...");
      await db.createCollection("scenes");
    }

    // Create indexes
    const scenesCollection = db.collection("scenes");

    await scenesCollection.createIndex({ user_id: 1, project_id: 1 });
    console.log("✓ Index created: { user_id, project_id }");

    await scenesCollection.createIndex({ user_id: 1, updated_at: -1 });
    console.log("✓ Index created: { user_id, updated_at }");

    // Unique index on _id is automatic

    console.log("✓ Collections and indexes initialized");
  } catch (err) {
    console.error("Error initializing collections:", err);
    throw err;
  }
}
