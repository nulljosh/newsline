package com.nulljosh.sidewise

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SidewiseTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = lightColorScheme(), content = content)

// ponytail: placeholder screen. Replace once the real UI is ported.
@Composable
fun AppScreen() {
    Surface {
        Box(Modifier.padding(24.dp)) {
            Text("Sidewise", style = MaterialTheme.typography.headlineMedium)
        }
    }
}
