package app.costyzarla.sync

import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView

/** Shown by Health Connect when someone asks why this app wants health data. */
class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        layout.addView(TextView(this).apply {
            text = getString(R.string.rationale_title)
            textSize = 22f
        })
        layout.addView(TextView(this).apply {
            text = getString(R.string.rationale_body)
            textSize = 16f
            setPadding(0, pad / 2, 0, 0)
        })
        setContentView(layout)
    }
}
