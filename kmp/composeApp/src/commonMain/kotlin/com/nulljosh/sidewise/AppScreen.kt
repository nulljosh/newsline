package com.nulljosh.sidewise

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SidewiseTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = lightColorScheme(), content = content)

private fun biasLabel(bias: Int) = when {
    bias <= -2 -> "Left"
    bias == -1 -> "Lean left"
    bias == 0 -> "Center"
    bias == 1 -> "Lean right"
    else -> "Right"
}

@Composable
fun AppScreen(client: SidewiseClient = SidewiseClient()) {
    var stories by remember { mutableStateOf<List<Story>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { stories = client.latest() }.onFailure { error = it.message ?: "failed to load" }
        loading = false
    }

    Surface {
        Column(Modifier.fillMaxSize().padding(24.dp)) {
            Text("Sidewise", style = MaterialTheme.typography.headlineMedium)
            when {
                loading -> CircularProgressIndicator(Modifier.padding(top = 24.dp))
                error != null -> Text(error!!, modifier = Modifier.padding(top = 16.dp))
                else -> LazyColumn(
                    modifier = Modifier.padding(top = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(stories) { s ->
                        Column {
                            Text(s.title, style = MaterialTheme.typography.titleMedium)
                            Text("${s.outlet} - ${biasLabel(s.bias)}")
                        }
                    }
                }
            }
        }
    }
}
