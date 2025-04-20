import { getTranscript, TranscriptEntry } from '@/lib/transcript'; // Adjust path if needed

interface WatchPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

// Removed old fetchTranscript function

export default async function WatchPage({ searchParams }: WatchPageProps) {
  const videoId = searchParams?.v; // Original line
  //const videoId = 'dQw4w9WgXcQ'; // Hardcoded video ID for testing

  if (typeof videoId !== 'string' || !videoId) {
    return (
      <main className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Missing Video ID</h1>
        <p>Please provide a video ID in the URL, like: /watch?v=VIDEO_ID</p>
      </main>
    );
  }

  // Call the new function (KV binding access is handled inside getTranscript)
  const transcriptData = await getTranscript(videoId);

  // Check for null (error)
  if (transcriptData === null) {
    return (
      <main className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Error</h1>
        <p>Could not fetch transcript for video ID: {videoId}. An error occurred during fetching or processing.</p>
      </main>
    );
  }

  // Check for empty array (no transcript found)
  if (transcriptData.length === 0) {
    return (
      <main className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">No Transcript Available</h1>
        <p>No transcript could be found for video ID: {videoId}.</p>
        <p>This might be because the video ID is invalid, the video is private, or it simply doesn&apos;t have captions/transcript.</p>
      </main>
    );
  }


  // Render the transcript
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Transcript for Video ID: {videoId}</h1>
      <div className="space-y-2">
        {transcriptData.map((entry: TranscriptEntry, index: number) => (
          <div key={index} className="p-2 border rounded bg-gray-50">
            <span className="text-sm text-gray-500 mr-2">
              {/* Format time (offset is likely in milliseconds) */}
              {new Date(entry.offset).toISOString().substr(14, 5)}
            </span>
            <span>{entry.text}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
