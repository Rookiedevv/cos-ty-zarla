package app.costyzarla.sync

import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Thrown when the server no longer recognises this phone (disconnected in Settings). */
class UnauthorizedException : Exception("unauthorized")

/** Thrown when a connection code is wrong or expired. */
class InvalidCodeException : Exception("invalid_code")

object Api {
    private val base = BuildConfig.SERVER_URL

    private fun post(path: String, body: JSONObject, token: String? = null): Pair<Int, String> {
        val conn = URL("$base$path").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            return code to text
        } finally {
            conn.disconnect()
        }
    }

    /** Trades the code from Settings for this phone's own token. */
    @Throws(IOException::class, InvalidCodeException::class)
    fun pair(code: String): String {
        val label = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}".take(80)
        val (status, text) = post("/api/device/pair", JSONObject().put("code", code).put("label", label))
        if (status == 400) throw InvalidCodeException()
        if (status !in 200..299) throw IOException("HTTP $status")
        return JSONObject(text).getString("token")
    }

    @Throws(IOException::class, UnauthorizedException::class)
    fun sync(token: String, days: List<DayTotals>) {
        val arr = JSONArray()
        for (d in days) {
            arr.put(
                JSONObject()
                    .put("date", d.date.toString())
                    .put("steps", d.steps ?: JSONObject.NULL)
                    .put("active_kcal", d.activeKcal?.let { Math.round(it) } ?: JSONObject.NULL)
                    .put("exercise_minutes", d.exerciseMinutes ?: JSONObject.NULL)
                    .put("sleep_minutes", d.sleepMinutes ?: JSONObject.NULL),
            )
        }
        val (status, _) = post("/api/device/sync", JSONObject().put("app_version", BuildConfig.VERSION_NAME).put("days", arr), token)
        if (status == 401) throw UnauthorizedException()
        if (status !in 200..299) throw IOException("HTTP $status")
    }
}
