package app.costyzarla.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.IOException
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/** Reads today and yesterday from Health Connect and sends the totals. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val outcome = syncNow(applicationContext)
        return if (outcome.retry) Result.retry() else Result.success()
    }

    companion object {
        private const val PERIODIC = "periodic-sync"
        private const val ONE_OFF = "sync-now"

        data class Outcome(val message: String, val retry: Boolean)

        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** Every 15 minutes (Android's shortest interval), only when online. Survives reboots. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun runOnce(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniqueWork(ONE_OFF, ExistingWorkPolicy.REPLACE, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        }

        /** Shared by the background job and the "Sync now" button. */
        suspend fun syncNow(context: Context): Outcome {
            val prefs = Prefs(context)
            val token = prefs.token ?: return Outcome("not connected", retry = false)
            return try {
                val today = LocalDate.now()
                val days = listOf(HealthReader.readDay(context, today.minusDays(1)), HealthReader.readDay(context, today))
                Api.sync(token, days)
                val t = days.last()
                val msg = context.getString(R.string.sync_ok, t.steps ?: 0L, Math.round(t.activeKcal ?: 0.0), t.sleepMinutes ?: 0L)
                prefs.lastSyncAt = System.currentTimeMillis()
                prefs.lastMessage = msg
                Outcome(msg, retry = false)
            } catch (e: UnauthorizedException) {
                // Disconnected from the web app: stop syncing until a new code is entered.
                prefs.token = null
                cancel(context)
                val msg = context.getString(R.string.disconnected)
                prefs.lastMessage = msg
                Outcome(msg, retry = false)
            } catch (e: SecurityException) {
                // Health Connect access was not granted (or not in the background).
                val msg = context.getString(R.string.sync_failed, context.getString(R.string.perm_needed))
                prefs.lastMessage = msg
                Outcome(msg, retry = false)
            } catch (e: IOException) {
                val msg = context.getString(R.string.sync_failed, e.message ?: "network")
                prefs.lastMessage = msg
                Outcome(msg, retry = true)
            } catch (e: Exception) {
                val msg = context.getString(R.string.sync_failed, e.javaClass.simpleName)
                prefs.lastMessage = msg
                Outcome(msg, retry = false)
            }
        }
    }
}
