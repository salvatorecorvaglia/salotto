import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { useChatStore } from '../store/chatStore';
import { PhoneOff } from 'lucide-react';

interface CallRoomProps {
  token: string;
  livekitUrl: string;
}

export default function CallRoom({ token, livekitUrl }: CallRoomProps) {
  const setActiveCall = useChatStore((s) => s.setActiveCall);

  const handleDisconnect = () => {
    setActiveCall(null);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d121f] overflow-hidden relative">
      <div className="h-14 border-b border-slate-800 px-6 flex items-center justify-between shrink-0 bg-[#0b0f19]">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse" />
          <h2 className="text-white font-medium text-sm">Active Voice & Video Call</h2>
        </div>
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-lg active:scale-[0.98] transition-transform cursor-pointer"
        >
          <PhoneOff className="h-4 w-4" />
          <span>Leave Room</span>
        </button>
      </div>

      {/* LiveKit Video Grid component */}
      <div className="flex-1 min-h-0 relative">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={livekitUrl}
          data-lk-theme="default"
          onDisconnected={handleDisconnect}
          className="h-full"
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    </div>
  );
}
