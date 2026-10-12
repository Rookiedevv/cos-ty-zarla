package app.costyzarla.sync

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Totals for one local calendar day, as sent to the server. */
data class DayTotals(
    val date: LocalDate,
    val steps: Long?,
    val activeKcal: Double?,
    val exerciseMinutes: Long?,
    /** Sleep that ended on this morning (from 18:00 the evening before until 14:00). */
    val sleepMinutes: Long?,
)

object HealthReader {
    /** Permissions the app needs; background reads keep syncing when the app is closed. */
    val READ_PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
    )
    val ALL_PERMISSIONS = READ_PERMISSIONS + HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    fun isAvailable(context: Context): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    suspend fun grantedPermissions(context: Context): Set<String> =
        HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()

    /**
     * Reads one day. Aggregates let Health Connect remove duplicates when both the
     * watch and the phone recorded the same steps or sleep.
     */
    suspend fun readDay(context: Context, date: LocalDate, zone: ZoneId = ZoneId.systemDefault()): DayTotals {
        val client = HealthConnectClient.getOrCreate(context)
        val dayStart: Instant = date.atStartOfDay(zone).toInstant()
        val dayEnd: Instant = minOf(date.plusDays(1).atStartOfDay(zone).toInstant(), Instant.now())

        val activity = client.aggregate(
            AggregateRequest(
                metrics = setOf(
                    StepsRecord.COUNT_TOTAL,
                    ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                    ExerciseSessionRecord.EXERCISE_DURATION_TOTAL,
                ),
                timeRangeFilter = TimeRangeFilter.between(dayStart, dayEnd),
            ),
        )

        val sleepStart = date.minusDays(1).atTime(18, 0).atZone(zone).toInstant()
        val sleepEnd = minOf(date.atTime(14, 0).atZone(zone).toInstant(), Instant.now())
        val sleepMinutes = if (sleepEnd.isAfter(sleepStart)) {
            client.aggregate(
                AggregateRequest(
                    metrics = setOf(SleepSessionRecord.SLEEP_DURATION_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(sleepStart, sleepEnd),
                ),
            )[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMinutes()
        } else {
            null
        }

        return DayTotals(
            date = date,
            steps = activity[StepsRecord.COUNT_TOTAL],
            activeKcal = activity[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories,
            exerciseMinutes = activity[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes(),
            sleepMinutes = sleepMinutes,
        )
    }
}
