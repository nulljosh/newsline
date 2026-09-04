package com.nulljosh.sidewise

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class Story(
    val title: String,
    val link: String,
    val outlet: String,
    val publisher: String,
    val bias: Int,
    val ts: Long,
    val summary: String = "",
    val image: String? = null,
)

@Serializable
data class StoriesResponse(val updated: Long, val latest: List<Story>)

// Reads the same public /api/stories endpoint the web reader does. No RSS
// parsing here -- the Worker already fetches and clusters every feed.
class SidewiseClient(private val baseUrl: String = "https://sidewise.heyitsmejosh.com") {
    private val http = HttpClient {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    suspend fun latest(limit: Int = 50): List<Story> =
        http.get("$baseUrl/api/stories?view=latest&limit=$limit").body<StoriesResponse>().latest
}
