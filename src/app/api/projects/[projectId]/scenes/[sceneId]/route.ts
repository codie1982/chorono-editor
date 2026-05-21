import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db/mongodb";
import {
  authenticateRequest,
  createAuthErrorResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@/app/api/middleware/auth";

/**
 * PATCH /api/projects/[projectId]/scenes/[sceneId]
 * Auto-save scene data to MongoDB
 *
 * Request body:
 * {
 *   scene_data: ChronoScene,
 *   server_version: number  (CAS token for conflict detection)
 * }
 *
 * Response (200 OK):
 * {
 *   version_number: number,
 *   server_version: number,
 *   auto_saved_at: ISODate
 * }
 *
 * Response (409 Conflict):
 * {
 *   error: "conflict",
 *   server_version: number
 * }
 */
export async function PATCH(request: NextRequest, context: any) {
  try {
    // 1. Authentication
    const auth = await authenticateRequest(request);
    const userId = auth.userId;

    // 2. Extract params
    const { projectId, sceneId } = context.params;

    if (!ObjectId.isValid(sceneId)) {
      return createErrorResponse("Invalid scene ID", 400);
    }

    if (!projectId) {
      return createErrorResponse("Project ID required", 400);
    }

    // 3. Parse request body
    const body = await request.json();
    const { scene_data, server_version } = body;

    if (!scene_data) {
      return createErrorResponse("scene_data required", 400);
    }

    if (typeof server_version !== "number") {
      return createErrorResponse("server_version required (number)", 400);
    }

    // 4. Connect to database
    const db = await getDatabase();
    const scenesCollection = db.collection("scenes");

    // 5. Load current scene
    const currentScene = await scenesCollection.findOne({
      _id: new ObjectId(sceneId),
      project_id: projectId,
      user_id: userId,
    });

    if (!currentScene) {
      return createErrorResponse("Scene not found", 404);
    }

    // 6. Conflict detection (CAS check)
    const currentServerVersion = currentScene.server_version || 0;
    if (server_version !== currentServerVersion) {
      // Conflict: client is out of sync with server
      return createErrorResponse(
        `Conflict: expected version ${currentServerVersion}, got ${server_version}`,
        409
      );
    }

    // 7. Safe to write: no conflict
    const newVersionNumber = (currentScene.version_number || 0) + 1;
    const newServerVersion = currentServerVersion + 1;
    const now = new Date();

    const updateResult = await scenesCollection.findOneAndUpdate(
      { _id: new ObjectId(sceneId) },
      {
        $set: {
          scene_data,
          version_number: newVersionNumber,
          server_version: newServerVersion,
          auto_saved_at: now,
          updated_at: now,
        },
      },
      { returnDocument: "after" }
    );

    if (!updateResult || !updateResult.value) {
      return createErrorResponse("Failed to update scene", 500);
    }

    // 8. Git backup (async, fire-and-forget)
    // TODO: Implement gitBackupScene async function
    // gitBackupScene(sceneId, scene_data).catch(err => {
    //   console.error(`Git backup failed for scene ${sceneId}:`, err)
    // })

    // 9. Success response
    return createSuccessResponse({
      version_number: newVersionNumber,
      server_version: newServerVersion,
      auto_saved_at: now.toISOString(),
    });
  } catch (err) {
    console.error("PATCH /scenes error:", err);

    if (err instanceof Error && err.message.includes("Authentication failed")) {
      return createAuthErrorResponse(err.message);
    }

    return createErrorResponse(`Server error: ${err instanceof Error ? err.message : "Unknown"}`, 500);
  }
}

/**
 * GET /api/projects/[projectId]/scenes/[sceneId]
 * Load scene data from MongoDB
 *
 * Response (200 OK):
 * {
 *   _id: ObjectId,
 *   name: string,
 *   scene_data: ChronoScene,
 *   version_number: number,
 *   server_version: number,
 *   auto_saved_at: ISODate
 * }
 */
export async function GET(request: NextRequest, context: any) {
  try {
    // 1. Authentication
    const auth = await authenticateRequest(request);
    const userId = auth.userId;

    // 2. Extract params
    const { projectId, sceneId } = context.params;

    if (!ObjectId.isValid(sceneId)) {
      return createErrorResponse("Invalid scene ID", 400);
    }

    // 3. Connect to database
    const db = await getDatabase();
    const scenesCollection = db.collection("scenes");

    // 4. Find scene
    const scene = await scenesCollection.findOne({
      _id: new ObjectId(sceneId),
      project_id: projectId,
      user_id: userId,
    });

    if (!scene) {
      return createErrorResponse("Scene not found", 404);
    }

    // 5. Return scene
    return createSuccessResponse({
      _id: scene._id.toString(),
      name: scene.name,
      scene_data: scene.scene_data,
      version_number: scene.version_number || 0,
      server_version: scene.server_version || 0,
      auto_saved_at: scene.auto_saved_at || new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /scenes error:", err);

    if (err instanceof Error && err.message.includes("Authentication failed")) {
      return createAuthErrorResponse(err.message);
    }

    return createErrorResponse(`Server error: ${err instanceof Error ? err.message : "Unknown"}`, 500);
  }
}
