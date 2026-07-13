package com.careerdecision.mobile

import android.app.Application
import com.careerdecision.mobile.data.CareerRepository
import com.careerdecision.mobile.data.RetrofitCareerRemoteDataSource
import com.careerdecision.mobile.data.local.ActionDatabase
import com.careerdecision.mobile.data.local.RoomActionCache
import com.careerdecision.mobile.network.CareerApiFactory
import com.careerdecision.mobile.notification.reminder.ReminderGateway
import com.careerdecision.mobile.notification.reminder.WorkManagerReminderGateway
import com.careerdecision.mobile.sync.WorkManagerPendingSyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class CareerApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    lateinit var repository: CareerRepository
        private set
    lateinit var reminderGateway: ReminderGateway
        private set

    override fun onCreate() {
        super.onCreate()
        val sessionStore = SessionStore(this)
        val database = ActionDatabase.get(this)
        val api = CareerApiFactory.create { sessionStore.load()?.token }
        reminderGateway = WorkManagerReminderGateway(this).also { it.initializeChannels() }
        repository = CareerRepository(
            sessionStore = sessionStore,
            remote = RetrofitCareerRemoteDataSource(api),
            cache = RoomActionCache(database),
            scheduler = WorkManagerPendingSyncScheduler(this)
        )
        sessionStore.load()?.user?.id?.let { userId ->
            applicationScope.launch {
                val dao = database.actionDao()
                reminderGateway.reconcileTaskReminders(userId, dao.tasks(userId))
                val goal = dao.goal(userId)
                if (goal?.planId != null && goal.status == "active") {
                    reminderGateway.scheduleWeeklyReview(userId)
                } else {
                    reminderGateway.cancelWeeklyReview(userId)
                }
            }
        }
    }
}
