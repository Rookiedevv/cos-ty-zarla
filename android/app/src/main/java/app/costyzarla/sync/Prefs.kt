package app.costyzarla.sync

import android.content.Context

/** Small local storage: this phone's token and the last sync result. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("sync", Context.MODE_PRIVATE)

    var token: String?
        get() = sp.getString("token", null)
        set(v) = sp.edit().putString("token", v).apply()

    var lastSyncAt: Long
        get() = sp.getLong("last_sync_at", 0L)
        set(v) = sp.edit().putLong("last_sync_at", v).apply()

    var lastMessage: String?
        get() = sp.getString("last_message", null)
        set(v) = sp.edit().putString("last_message", v).apply()
}
