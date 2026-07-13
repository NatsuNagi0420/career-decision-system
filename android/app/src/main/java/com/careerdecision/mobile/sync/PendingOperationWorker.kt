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
import com.careerdecision.mobile.network.ApiException
import com.careerdecision.mobile.network.normalizeNetworkError
import kotlinx.coroutines.CancellationException
import java.util.concurrent.TimeUnit

class PendingOperationWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as CareerApplication
        return try {
            if (app.repository.syncPendingOperations()) Result.success() else Result.retry()
        } catch (error: Throwable) {
            when (classifyPendingSyncFailure(error)) {
                PendingSyncFailureDisposition.RETRY -> Result.retry()
                PendingSyncFailureDisposition.FAILURE -> Result.failure()
            }
        }
    }
}

internal enum class PendingSyncFailureDisposition { RETRY, FAILURE }

internal fun classifyPendingSyncFailure(error: Throwable): PendingSyncFailureDisposition {
    if (error is CancellationException) throw error
    val normalized = normalizeNetworkError(error)
    return if (normalized.isUnauthorized()) {
        PendingSyncFailureDisposition.FAILURE
    } else {
        PendingSyncFailureDisposition.RETRY
    }
}

private fun ApiException.isUnauthorized(): Boolean = httpStatus == 401 || apiCode == 401

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
