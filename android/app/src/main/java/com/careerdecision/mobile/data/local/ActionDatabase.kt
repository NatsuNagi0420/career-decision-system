package com.careerdecision.mobile.data.local

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Entity(tableName = "cached_goals")
data class CachedGoalEntity(
    @PrimaryKey val userId: Long,
    val planId: Long?,
    val projectId: Long?,
    val targetId: Long?,
    val targetRole: String?,
    val status: String?,
    val durationWeeks: Int,
    val taskCount: Int,
    val completedTaskCount: Int,
    val progressPercent: Int,
    val startDate: String?,
    val endDate: String?,
    val updatedAt: String?,
    val backupTarget: String? = null,
    val decisionReason: String? = null,
    val mainRisks: String? = null,
    val reviewDate: String? = null,
    val confirmedAt: String? = null,
    val evidenceCount: Int = 0,
    val resultCount: Int = 0,
    val currentWeek: Int = 1
)

@Entity(
    tableName = "cached_tasks",
    indices = [Index("userId"), Index(value = ["userId", "planId", "weekNo"])]
)
data class CachedTaskEntity(
    @PrimaryKey val taskId: Long,
    val userId: Long,
    val planId: Long,
    val weekNo: Int,
    val title: String,
    val taskType: String,
    val content: String?,
    val status: String,
    val dueAt: String?,
    val estimatedMinutes: Int?,
    val acceptanceCriteria: String,
    val deferredTo: String?,
    val skipReason: String?,
    val resultCount: Int,
    val sortOrder: Int,
    val version: Int,
    val updatedAt: String?
)

@Entity(
    tableName = "pending_operations",
    indices = [Index(value = ["operationId"], unique = true), Index(value = ["userId", "createdAt"])]
)
data class PendingOperationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val operationId: String,
    val userId: Long,
    val planId: Long,
    val taskId: Long,
    val operationType: String,
    val expectedVersion: Int? = null,
    val reviewWeekNo: Int? = null,
    val completedSummary: String? = null,
    val evidenceSummary: String? = null,
    val difficulties: String? = null,
    val nextWeekMinutes: Int? = null,
    val confidenceTrend: String? = null,
    val confidenceReason: String? = null,
    val taskStatus: String? = null,
    val reason: String? = null,
    val deferredTo: String? = null,
    val description: String? = null,
    val linkUrl: String? = null,
    val attempts: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "cached_chat_sessions")
data class CachedChatSessionEntity(
    @PrimaryKey val userId: Long,
    val sessionId: Long?,
    val page: String,
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "cached_chat_messages",
    indices = [
        Index(value = ["userId", "requestId", "role"], unique = true),
        Index(value = ["userId", "createdAt"])
    ]
)
data class CachedChatMessageEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val userId: Long,
    val requestId: String,
    val sessionId: Long?,
    val role: String,
    val content: String,
    val deliveryStatus: String,
    val page: String?,
    val contextJson: String?,
    val responseJson: String?,
    val errorMessage: String?,
    val createdAt: Long = System.currentTimeMillis()
)

@Dao
interface ActionDao {
    @Query("SELECT * FROM cached_goals WHERE userId = :userId LIMIT 1")
    suspend fun goal(userId: Long): CachedGoalEntity?

    @Query("SELECT * FROM cached_tasks WHERE userId = :userId ORDER BY weekNo, sortOrder, taskId")
    suspend fun tasks(userId: Long): List<CachedTaskEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveGoal(goal: CachedGoalEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveTasks(tasks: List<CachedTaskEntity>)

    @Query("DELETE FROM cached_tasks WHERE userId = :userId")
    suspend fun deleteTasks(userId: Long)

    @Query("UPDATE cached_tasks SET status = :status, deferredTo = :deferredTo, skipReason = :reason, version = version + 1 WHERE taskId = :taskId AND userId = :userId")
    suspend fun updateTaskStatus(userId: Long, taskId: Long, status: String, reason: String?, deferredTo: String?)

    @Query("UPDATE cached_tasks SET resultCount = resultCount + 1 WHERE taskId = :taskId AND userId = :userId")
    suspend fun incrementResultCount(userId: Long, taskId: Long)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun enqueue(operation: PendingOperationEntity): Long

    @Query("SELECT * FROM pending_operations WHERE userId = :userId ORDER BY createdAt, id LIMIT :limit")
    suspend fun pending(userId: Long, limit: Int): List<PendingOperationEntity>

    @Query("SELECT * FROM pending_operations WHERE userId = :userId AND planId = :planId AND operationType = 'weekly_review' ORDER BY createdAt, id LIMIT 1")
    suspend fun pendingWeeklyReview(userId: Long, planId: Long): PendingOperationEntity?

    @Query("DELETE FROM pending_operations WHERE id = :id")
    suspend fun deletePending(id: Long)

    @Query("UPDATE pending_operations SET attempts = attempts + 1, lastError = :message WHERE id = :id")
    suspend fun recordFailure(id: Long, message: String)

    @Query("SELECT COUNT(*) FROM pending_operations WHERE userId = :userId")
    suspend fun pendingCount(userId: Long): Int

    @Query("SELECT * FROM cached_chat_sessions WHERE userId = :userId LIMIT 1")
    suspend fun chatSession(userId: Long): CachedChatSessionEntity?

    @Query("SELECT * FROM cached_chat_messages WHERE userId = :userId ORDER BY id")
    suspend fun chatMessages(userId: Long): List<CachedChatMessageEntity>

    @Query("SELECT * FROM cached_chat_messages WHERE userId = :userId AND requestId = :requestId AND role = 'user' LIMIT 1")
    suspend fun chatRequest(userId: Long, requestId: String): CachedChatMessageEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveChatSession(session: CachedChatSessionEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertChatMessage(message: CachedChatMessageEntity): Long

    @Query("UPDATE cached_chat_messages SET deliveryStatus = :status, errorMessage = :errorMessage WHERE userId = :userId AND requestId = :requestId AND role = 'user'")
    suspend fun updateChatRequestStatus(
        userId: Long,
        requestId: String,
        status: String,
        errorMessage: String?
    )

    @Query("DELETE FROM cached_chat_messages WHERE userId = :userId")
    suspend fun deleteChatMessages(userId: Long)

    @Query("DELETE FROM cached_chat_sessions WHERE userId = :userId")
    suspend fun deleteChatSession(userId: Long)

    @Query("DELETE FROM cached_goals WHERE userId = :userId")
    suspend fun deleteGoal(userId: Long)

    @Query("DELETE FROM pending_operations WHERE userId = :userId")
    suspend fun deletePendingForUser(userId: Long)
}

@Database(
    entities = [
        CachedGoalEntity::class,
        CachedTaskEntity::class,
        PendingOperationEntity::class,
        CachedChatSessionEntity::class,
        CachedChatMessageEntity::class
    ],
    version = 4,
    exportSchema = true
)
abstract class ActionDatabase : RoomDatabase() {
    abstract fun actionDao(): ActionDao

    companion object {
        @Volatile private var instance: ActionDatabase? = null

        private val migration1To2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE cached_goals ADD COLUMN backupTarget TEXT")
                database.execSQL("ALTER TABLE cached_goals ADD COLUMN decisionReason TEXT")
                database.execSQL("ALTER TABLE cached_goals ADD COLUMN mainRisks TEXT")
                database.execSQL("ALTER TABLE cached_goals ADD COLUMN reviewDate TEXT")
                database.execSQL("ALTER TABLE cached_goals ADD COLUMN confirmedAt TEXT")
                database.execSQL("ALTER TABLE cached_goals ADD COLUMN evidenceCount INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE cached_goals ADD COLUMN resultCount INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val migration2To3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE cached_tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE cached_goals ADD COLUMN currentWeek INTEGER NOT NULL DEFAULT 1")
                database.execSQL("ALTER TABLE pending_operations ADD COLUMN expectedVersion INTEGER")
                database.execSQL("ALTER TABLE pending_operations ADD COLUMN reviewWeekNo INTEGER")
                database.execSQL("ALTER TABLE pending_operations ADD COLUMN completedSummary TEXT")
                database.execSQL("ALTER TABLE pending_operations ADD COLUMN evidenceSummary TEXT")
                database.execSQL("ALTER TABLE pending_operations ADD COLUMN difficulties TEXT")
                database.execSQL("ALTER TABLE pending_operations ADD COLUMN nextWeekMinutes INTEGER")
                database.execSQL("ALTER TABLE pending_operations ADD COLUMN confidenceTrend TEXT")
                database.execSQL("ALTER TABLE pending_operations ADD COLUMN confidenceReason TEXT")
                database.execSQL("UPDATE pending_operations SET expectedVersion = 0 WHERE operationType = 'task_status' AND expectedVersion IS NULL")
            }
        }

        private val migration3To4 = object : Migration(3, 4) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS cached_chat_sessions (
                      userId INTEGER NOT NULL,
                      sessionId INTEGER,
                      page TEXT NOT NULL,
                      updatedAt INTEGER NOT NULL,
                      PRIMARY KEY(userId)
                    )
                    """.trimIndent()
                )
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS cached_chat_messages (
                      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                      userId INTEGER NOT NULL,
                      requestId TEXT NOT NULL,
                      sessionId INTEGER,
                      role TEXT NOT NULL,
                      content TEXT NOT NULL,
                      deliveryStatus TEXT NOT NULL,
                      page TEXT,
                      contextJson TEXT,
                      responseJson TEXT,
                      errorMessage TEXT,
                      createdAt INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                database.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS index_cached_chat_messages_userId_requestId_role " +
                        "ON cached_chat_messages (userId, requestId, role)"
                )
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_cached_chat_messages_userId_createdAt " +
                        "ON cached_chat_messages (userId, createdAt)"
                )
            }
        }

        fun get(context: Context): ActionDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                ActionDatabase::class.java,
                "career_action.db"
            ).addMigrations(migration1To2, migration2To3, migration3To4).build().also { instance = it }
        }
    }
}
