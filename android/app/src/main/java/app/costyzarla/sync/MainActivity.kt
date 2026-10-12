package app.costyzarla.sync

import android.graphics.Typeface
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.text.format.DateUtils
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException

/** One simple screen: connect with a code, allow health data, see the last sync. */
class MainActivity : ComponentActivity() {
    private lateinit var prefs: Prefs
    private lateinit var status: TextView
    private lateinit var pairBox: LinearLayout
    private lateinit var codeInput: EditText
    private lateinit var pairButton: Button
    private lateinit var connectedBox: LinearLayout
    private lateinit var permText: TextView
    private lateinit var allowButton: Button
    private lateinit var syncButton: Button
    private lateinit var lastSync: TextView

    private val requestPermissions = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) {
        refresh()
        if (prefs.token != null) runSync()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        setContentView(buildUi())
        if (prefs.token != null) SyncWorker.schedule(this)
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(28))
        }
        fun text(resId: Int? = null, size: Float = 16f, bold: Boolean = false) = TextView(this).apply {
            if (resId != null) setText(resId)
            textSize = size
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(6), 0, dp(6))
        }
        fun button(resId: Int, onClick: () -> Unit) = Button(this).apply {
            setText(resId)
            minHeight = dp(52)
            setOnClickListener { onClick() }
        }

        root.addView(text(R.string.title, 24f, bold = true))
        root.addView(text(R.string.intro))
        status = text(size = 16f, bold = true)
        root.addView(status)

        pairBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        pairBox.addView(text(R.string.code_label))
        codeInput = EditText(this).apply {
            setHint(R.string.code_hint)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            filters = arrayOf(InputFilter.AllCaps(), InputFilter.LengthFilter(12))
            textSize = 24f
            letterSpacing = 0.1f
        }
        pairBox.addView(codeInput)
        pairButton = button(R.string.connect) { pair() }
        pairBox.addView(pairButton)
        root.addView(pairBox)

        connectedBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        permText = text()
        connectedBox.addView(permText)
        allowButton = button(R.string.allow) { requestPermissions.launch(HealthReader.ALL_PERMISSIONS) }
        connectedBox.addView(allowButton)
        syncButton = button(R.string.sync_now) { runSync() }
        connectedBox.addView(syncButton)
        lastSync = text(size = 14f)
        connectedBox.addView(lastSync)
        connectedBox.addView(button(R.string.disconnect) {
            prefs.token = null
            SyncWorker.cancel(this)
            status.setText(R.string.disconnected)
            refresh()
        })
        root.addView(connectedBox)

        return ScrollView(this).apply { addView(root) }
    }

    private fun refresh() {
        if (!HealthReader.isAvailable(this)) {
            status.setText(R.string.hc_missing)
            pairBox.visibility = View.GONE
            connectedBox.visibility = View.GONE
            return
        }
        val connected = prefs.token != null
        pairBox.visibility = if (connected) View.GONE else View.VISIBLE
        connectedBox.visibility = if (connected) View.VISIBLE else View.GONE
        if (!connected) return

        status.setText(R.string.connected)
        val at = prefs.lastSyncAt
        val ago = if (at == 0L) getString(R.string.never) else DateUtils.getRelativeTimeSpanString(at).toString()
        lastSync.text = listOfNotNull(getString(R.string.last_sync, ago), prefs.lastMessage).joinToString("\n")

        lifecycleScope.launch {
            val granted = runCatching { HealthReader.grantedPermissions(this@MainActivity) }.getOrDefault(emptySet())
            val haveRead = granted.containsAll(HealthReader.READ_PERMISSIONS)
            val haveBackground = granted.containsAll(HealthReader.ALL_PERMISSIONS)
            permText.text = when {
                !haveRead -> getString(R.string.perm_needed)
                !haveBackground -> getString(R.string.perm_background)
                else -> getString(R.string.perm_ok)
            }
            allowButton.visibility = if (haveBackground) View.GONE else View.VISIBLE
            syncButton.isEnabled = haveRead
        }
    }

    private fun pair() {
        val code = codeInput.text.toString().trim()
        if (code.isEmpty()) return
        pairButton.isEnabled = false
        pairButton.setText(R.string.connecting)
        lifecycleScope.launch {
            val error = withContext(Dispatchers.IO) {
                try {
                    prefs.token = Api.pair(code)
                    null
                } catch (e: InvalidCodeException) {
                    getString(R.string.bad_code)
                } catch (e: IOException) {
                    getString(R.string.network_error)
                }
            }
            pairButton.isEnabled = true
            pairButton.setText(R.string.connect)
            if (error != null) {
                status.text = error
                return@launch
            }
            codeInput.setText("")
            SyncWorker.schedule(this@MainActivity)
            refresh()
            requestPermissions.launch(HealthReader.ALL_PERMISSIONS)
        }
    }

    private fun runSync() {
        syncButton.isEnabled = false
        syncButton.setText(R.string.syncing)
        lifecycleScope.launch {
            val outcome = withContext(Dispatchers.IO) { SyncWorker.syncNow(this@MainActivity) }
            syncButton.setText(R.string.sync_now)
            syncButton.isEnabled = true
            status.text = outcome.message
            refresh()
        }
    }
}
