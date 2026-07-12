package com.careerdecision.mobile.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.careerdecision.mobile.CareerApplication
import com.careerdecision.mobile.data.PendingSyncScheduler
import java.util.concurrent.TimeUnit

class PendingOperationWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as CareerApplication
        return runCatching { app.repository.syncPendingOperations() }
            .fold(
                onSuccess = { synced -> if (synced) Result.success() else Result.retry() },
                onFailure = { Result.retry() }
            )
    }
}

class WorkManagerPendingSyncScheduler(context: Context) : PendingSyncScheduler {
    private val workManager = WorkManager.getInstance(context.applicationContext)

    override fun schedule() {
        val request = OneTimeWorkRequestBuilder<PendingOperationWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }

    private companion object {
        const val WORK_NAME = "sync-career-action-operations"
    }
}
