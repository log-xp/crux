// src/lib/transcript.ts
import { KVNamespace } from '@cloudflare/workers-types'; // Assuming Cloudflare Workers types

// Define the expected structure from Supadata API (adjust if needed)
export interface TranscriptEntry {
  offset: number; // Assuming milliseconds
  text: string;
}

// Define the structure for the Supadata API response
interface SupadataTranscriptResponse {
  transcript?: TranscriptEntry[];
  error?: string;
  // Add other potential fields if necessary
}


// Function to get the KV binding (adapt based on your Cloudflare/Next.js setup)
// IMPORTANT: Ensure 'TRANSCRIPT_CACHE' matches your binding name in wrangler.toml/dashboard
function getTranscriptCacheKV(): KVNamespace | null {
    // Accessing the KV binding.  The method depends on your Cloudflare environment.

    // 1. Cloudflare Pages (process.env):  If using Cloudflare Pages, the KV binding
    //    is typically available as an environment variable.  However, it might not
    //    be directly usable as a KVNamespace object.  You might need to adapt this.
    if (process.env.TRANSCRIPT_CACHE) {
        try {
            // Attempt to cast the environment variable to KVNamespace.  This might work
            // in some setups, but it's not guaranteed.
            return process.env.TRANSCRIPT_CACHE as unknown as KVNamespace;
        } catch (e) {
            console.error("Error casting TRANSCRIPT_CACHE from process.env:", e);
            console.warn("TRANSCRIPT_CACHE might not be directly accessible as KVNamespace via process.env.");
        }
    }

    // 2. Cloudflare Workers (context.env):  In a pure Cloudflare Workers environment,
    //    the KV binding is usually passed in the 'context' object of the handler function.
    //    Adapt this section if you're using Workers and have access to the context.
    //    Example (adjust based on your worker setup):
    //    if (context && context.env && context.env.TRANSCRIPT_CACHE) {
    //        return context.env.TRANSCRIPT_CACHE as KVNamespace;
    //    }

    // Log a warning if no KV binding is found.
    console.warn("TRANSCRIPT_CACHE KV binding not found.  Caching will be disabled.");
    return null;
}

export async function getTranscript(videoId: string): Promise<TranscriptEntry[] | null> {
  const kv = getTranscriptCacheKV();
  const apiKey = process.env.SUPADATA_API_KEY;

  if (!apiKey) {
    console.error("SUPADATA_API_KEY environment variable not set.");
    // Return null to indicate a configuration error prevents fetching
    return null;
  }

  // 1. Check Cache (if KV is available)
  if (kv) {
    try {
      // Use { type: 'json' } to automatically parse the JSON stored in KV
      const cachedTranscript = await kv.get<TranscriptEntry[]>(videoId, { type: 'json' });
      if (cachedTranscript !== null) { // Check for explicit null, as empty array is valid cache entry
        console.log(`Cache hit for videoId: ${videoId}`);
        return cachedTranscript; // Return empty array if that's what was cached (e.g., for 'not found')
      }
      console.log(`Cache miss for videoId: ${videoId}`);
    } catch (error) {
      console.error(`Error reading from KV cache for ${videoId}:`, error);
      // Proceed to fetch from API even if cache read fails
    }
  } else {
     console.warn("KV Namespace not available. Skipping cache check.");
  }


  // 2. Fetch from Supadata API if not in cache or cache unavailable
  const apiUrl = `https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}`;
  console.log(`Fetching transcript from Supadata for videoId: ${videoId}`);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json', // Ensure we ask for JSON
      },
      // Consider Cloudflare-specific fetch options if needed (e.g., caching directives)
      // cf: { cacheTtl: 60, cacheEverything: true } // Example Cloudflare fetch options
    });

    if (!response.ok) {
      const errorBody = await response.text(); // Read body for logging
      console.error(`Supadata API error for ${videoId}: ${response.status} ${response.statusText}. Body: ${errorBody}`);

       // Handle specific statuses like 404 (no transcript) or 429 (rate limit) appropriately
       if (response.status === 404) {
           console.log(`Transcript not found via Supadata for videoId: ${videoId}`);
           // Cache the "not found" state as an empty array to avoid refetching
           if (kv) {
               try {
                   // Cache empty array with a TTL (e.g., 1 hour)
                   await kv.put(videoId, JSON.stringify([]), { expirationTtl: 3600 });
                   console.log(`Cached 'not found' state for videoId: ${videoId}`);
               } catch (kvError) {
                   console.error(`Error caching 'not found' state for ${videoId}:`, kvError);
               }
           }
           return []; // Return empty array to signify no transcript found
       }
      // For other errors (5xx, 4xx), return null to indicate a fetch problem
      return null;
    }

    // Check content type before parsing JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        console.error(`Unexpected content-type from Supadata API for ${videoId}: ${contentType}`);
        const responseText = await response.text();
        console.error(`Response Text: ${responseText}`);
        return null; // Indicate error due to unexpected response format
    }


    const data: SupadataTranscriptResponse = await response.json();

    if (data.error) {
         console.error(`Supadata API returned error in JSON for ${videoId}: ${data.error}`);
         // Potentially cache this error state if needed, similar to 'not found'
         return null;
    }

    const transcript = data.transcript; // Assuming the transcript is in a 'transcript' field

    // Handle cases where API succeeds but returns no transcript data
    if (!transcript) {
         console.log(`No 'transcript' field in Supadata response for videoId: ${videoId}`);
         // Cache as empty array (treat as 'not found')
         if (kv) {
             try {
                 await kv.put(videoId, JSON.stringify([]), { expirationTtl: 3600 });
                 console.log(`Cached empty/missing transcript state for videoId: ${videoId}`);
             } catch (kvError) {
                 console.error(`Error caching empty/missing state for ${videoId}:`, kvError);
             }
         }
         return [];
    }

     if (transcript.length === 0) {
         console.log(`Empty transcript array returned by Supadata for videoId: ${videoId}`);
         // Cache the empty array state
         if (kv) {
             try {
                 await kv.put(videoId, JSON.stringify([]), { expirationTtl: 3600 });
                 console.log(`Cached empty transcript state for videoId: ${videoId}`);
             } catch (kvError) {
                 console.error(`Error caching empty state for ${videoId}:`, kvError);
             }
         }
         return [];
     }


    // 3. Store in Cache (if KV is available)
    if (kv) {
      try {
        // Store the valid transcript data as JSON string indefinitely
        // Or add expirationTtl: <seconds> if transcripts might become stale
        await kv.put(videoId, JSON.stringify(transcript));
        console.log(`Cached transcript successfully for videoId: ${videoId}`);
      } catch (error) {
        console.error(`Error writing transcript to KV cache for ${videoId}:`, error);
        // Return the transcript even if caching fails this time
      }
    }

    return transcript;

  } catch (error) {
    // Catch network errors or other exceptions during fetch/processing
    console.error(`Network or processing error getting transcript for ${videoId}:`, error);
    return null; // Indicate failure
  }
}
