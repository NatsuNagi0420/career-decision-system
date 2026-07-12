package com.careerdecision.mobile

import android.app.Application
import com.careerdecision.mobile.data.CareerRepository
import com.careerdecision.mobile.data.RetrofitCareerRemoteDataSource
import com.careerdecision.mobile.data.local.ActionDatabase
import com.careerdecision.mobile.data.local.RoomActionCache
import com.careerdecision.mobile.network.CareerApiFactory
import com.careerdecision.mobile.sync.WorkManagerPendingSyncScheduler

class CareerApplication : Application() {
    lateinit var repository: CareerRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val sessionStore = SessionStore(this)
        val api = CareerApiFactory.create { sessionStore.load()?.token }
        repository = CareerRepository(
            sessionStore = sessionStore,
            remote = RetrofitCareerRemoteDataSource(api),
            cache = RoomActionCache(ActionDatabase.get(this)),
            scheduler = WorkManagerPendingSyncScheduler(this)
        )
    }
}
