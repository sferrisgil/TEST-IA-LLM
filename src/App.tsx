import { useState, useRef, useEffect } from "react";
import { 
  Mic2, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  FileText, 
  Headphones, 
  Sparkles,
  Loader2,
  BookOpen,
  History,
  X,
  Volume2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface Source {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'url';
}

export default function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceContent, setNewSourceContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [podcast, setPodcast] = useState<{ script: string; audioUrl: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const addSource = () => {
    if (!newSourceTitle || !newSourceContent) return;
    const newSource: Source = {
      id: Math.random().toString(36).substring(2, 9),
      title: newSourceTitle,
      content: newSourceContent,
      type: 'text'
    };
    setSources([...sources, newSource]);
    setNewSourceTitle("");
    setNewSourceContent("");
  };

  const removeSource = (id: string) => {
    setSources(sources.filter(s => s.id !== id));
  };

  const generatePodcast = async () => {
    if (sources.length === 0) return;
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: sources.map(s => s.content) }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Convert base64 to playable WAV Blob URL
      const binary = atob(data.audioBase64);
      const dataArray = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        dataArray[i] = binary.charCodeAt(i);
      }
      
      // Add WAV header (24000Hz, 16-bit, Mono)
      const sampleRate = 24000;
      const header = new ArrayBuffer(44);
      const view = new DataView(header);
      view.setUint32(0, 0x52494646, false); // "RIFF"
      view.setUint32(4, 36 + dataArray.length, true);
      view.setUint32(8, 0x57415645, false); // "WAVE"
      view.setUint32(12, 0x666d7420, false); // "fmt "
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // Mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true); // Byte rate
      view.setUint16(32, 2, true); // Block align
      view.setUint16(34, 16, true); // Bits per sample
      view.setUint32(36, 0x64617461, false); // "data"
      view.setUint32(40, dataArray.length, true);

      const blob = new Blob([header, dataArray], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      setPodcast({ script: data.script, audioUrl: url });
    } catch (error) {
      console.error("Error generating podcast:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [podcast]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-screen bg-[#F8F7F2] text-[#33302E] font-sans overflow-hidden">
      {/* Sidebar - Sources */}
      <aside className="w-80 border-r border-[#E0DED3] bg-[#EBE9E1] flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-[#5E6C5B] rounded-xl flex items-center justify-center shadow-lg shadow-[#5E6C5B]/20">
              <Headphones className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#33302E]">NoteCast</h1>
              <p className="text-[10px] uppercase tracking-widest font-bold text-[#7A756B]">Natural Tones Edition</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#7A756B]">Knowledge Sources</h2>
              <Badge variant="outline" className="text-[9px] border-[#D3CBB8] bg-white/50 text-[#5E6C5B]">{sources.length}</Badge>
            </div>
            <Card className="border-[#D3CBB8] bg-white/40 border-dashed shadow-none hover:bg-white hover:border-[#5E6C5B]/30 transition-all cursor-pointer group" onClick={() => (document.getElementById('add-source-modal') as any)?.showModal()}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border border-[#D3CBB8] flex items-center justify-center group-hover:bg-[#5E6C5B] group-hover:text-white transition-all text-[#5E6C5B]">
                    <Plus className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-[#7A756B]">Add Knowledge</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-3 pb-6">
            <AnimatePresence mode="popLayout">
              {sources.map(source => (
                <motion.div
                  key={source.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  layout
                >
                  <Card className="border-white/80 shadow-sm bg-white/60 hover:bg-white hover:border-[#5E6C5B]/20 transition-all group overflow-hidden rounded-xl">
                    <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-bold truncate max-w-[140px] text-[#33302E]">{source.title}</CardTitle>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-[#7A756B]/40 hover:text-red-500 hover:bg-red-50"
                        onClick={() => removeSource(source.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-[11px] text-[#7A756B] line-clamp-2 leading-relaxed">{source.content}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                         <div className="w-1.5 h-1.5 rounded-full bg-[#5E6C5B]/40" />
                         <span className="text-[9px] font-bold text-[#5E6C5B] uppercase tracking-tighter">Text Entry</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>

        <div className="p-6 bg-[#D3CBB8]/20 border-t border-[#E0DED3]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#5E6C5B] animate-pulse"></div>
            <span className="text-xs font-medium text-[#33302E]">AI Indexing Active</span>
          </div>
          <p className="text-[10px] text-[#7A756B] leading-relaxed uppercase tracking-wider font-bold">
            {sources.length} Resources Processed
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-[#FDFDFB]">
        <header className="h-16 border-b border-[#E0DED3] flex items-center justify-between px-8 bg-white">
           <Tabs defaultValue="guide" className="w-[450px]">
              <TabsList className="bg-[#EBE9E1]/50 p-1 border-[#E0DED3] h-11">
                <TabsTrigger value="guide" className="data-[state=active]:bg-white data-[state=active]:text-[#33302E] data-[state=active]:shadow-sm px-6 font-semibold">Notebook Guide</TabsTrigger>
                <TabsTrigger value="podcast" className="data-[state=active]:bg-white data-[state=active]:text-[#33302E] data-[state=active]:shadow-sm px-6 font-semibold">Deep Dive Podcast</TabsTrigger>
              </TabsList>
           </Tabs>
          
          <div className="flex items-center gap-3">
             <Button 
               className="h-10 px-8 gap-2 bg-[#5E6C5B] hover:bg-[#4C584A] text-white rounded-full shadow-lg shadow-[#5E6C5B]/20 transition-all active:scale-95"
               disabled={sources.length === 0 || isGenerating}
               onClick={generatePodcast}
             >
               {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
               <span className="font-bold tracking-tight">Generate Deep Dive</span>
             </Button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col relative bg-[#F8F7F2]">
          {podcast ? (
            <div className="flex-1 flex flex-col">
               <div className="p-8 pb-40 flex-1 overflow-y-auto">
                 <div className="max-w-4xl mx-auto space-y-12">
                    <div className="flex gap-12 items-center justify-center py-8">
                      <div className="flex flex-col items-center group">
                        <div className="w-24 h-24 rounded-full bg-[#5E6C5B] border-4 border-white shadow-xl flex items-center justify-center transition-transform group-hover:scale-105">
                           <span className="text-2xl text-white font-serif italic font-bold">J</span>
                        </div>
                        <span className="mt-4 text-sm font-bold text-[#33302E]">Joe</span>
                        <span className="text-xs text-[#7A756B] uppercase tracking-widest font-black">Co-Host</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#E0DED3]" />
                        <div className="w-2 h-2 rounded-full bg-[#D3CBB8]" />
                        <div className="w-2 h-2 rounded-full bg-[#E0DED3]" />
                      </div>

                      <div className="flex flex-col items-center group">
                        <div className="w-24 h-24 rounded-full bg-[#A89F8E] border-4 border-white shadow-xl flex items-center justify-center transition-transform group-hover:scale-105">
                           <span className="text-2xl text-white font-serif italic font-bold">J</span>
                        </div>
                        <span className="mt-4 text-sm font-bold text-[#33302E]">Jane</span>
                        <span className="text-xs text-[#7A756B] uppercase tracking-widest font-black">Expert</span>
                      </div>
                    </div>

                    <div className="text-center space-y-4">
                        <div className="flex items-center justify-center gap-2">
                          <Badge className="bg-[#5E6C5B]/10 text-[#5E6C5B] border-none rounded-full px-4 py-1 uppercase text-[10px] tracking-[0.2em] font-black">AI Generated Audio</Badge>
                        </div>
                        <h2 className="text-4xl font-extrabold tracking-tighter text-[#33302E]">Natural Language Analysis</h2>
                        <p className="text-[#7A756B] italic font-medium">Synthesized from {sources.length} knowledge sources</p>
                    </div>

                    <Separator className="bg-[#E0DED3]" />

                    <div className="space-y-10">
                       <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#7A756B]">Transcript Deep Dive</h3>
                       </div>
                       <div className="space-y-12">
                        {podcast.script.split("\n").map((line, i) => {
                          const [name, ...content] = line.split(": ");
                          if (!name || content.length === 0) return null;
                          const isJoe = name.trim().toLowerCase() === 'joe';
                          return (
                            <motion.div 
                              initial={{ opacity: 0, x: isJoe ? -20 : 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.1, type: "spring", damping: 15 }}
                              key={i} 
                              className={cn(
                                "flex gap-6 items-start",
                                !isJoe && "flex-row-reverse text-right"
                              )}
                            >
                              <div className={cn(
                                "w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center font-bold text-sm border-2 border-white shadow-md",
                                isJoe ? "bg-[#5E6C5B] text-white" : "bg-[#A89F8E] text-white"
                              )}>
                                {name[0]}
                              </div>
                              <div className={cn("max-w-2xl pt-1", !isJoe && "flex flex-col items-end")}>
                                <span className={cn(
                                  "text-[10px] font-black uppercase tracking-[0.2em] block mb-3",
                                  isJoe ? "text-[#5E6C5B]" : "text-[#A89F8E]"
                                )}>
                                  {name}
                                </span>
                                <p className={cn(
                                  "text-lg leading-relaxed text-[#33302E] font-medium tracking-tight bg-white p-6 rounded-[2rem] shadow-sm border border-[#E0DED3]/50",
                                  isJoe ? "rounded-tl-none" : "rounded-tr-none"
                                )}>
                                  {content.join(": ")}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                 </div>
               </div>

               {/* Natural Tones Audio Player */}
               <div className="fixed bottom-10 left-[360px] right-10 z-50">
                  <div className="bg-[#EBE9E1] border border-[#D3CBB8] p-8 rounded-[40px] shadow-2xl flex items-center justify-between gap-12 border-white/40 isolate overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
                    
                    <div className="flex items-center gap-6 w-72 relative">
                      <div className="w-16 h-16 bg-[#5E6C5B] rounded-2xl flex items-center justify-center shadow-lg shadow-[#5E6C5B]/20">
                         <Mic2 className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <div className="text-lg font-bold tracking-tight text-[#33302E]">Deep Dive Studio</div>
                        <div className="text-xs font-bold text-[#7A756B] uppercase tracking-widest mt-0.5 mt-1">Multi-Host AI</div>
                      </div>
                    </div>

                    <div className="flex-1 max-w-xl flex flex-col items-center gap-5 relative">
                      <div className="flex items-center gap-10">
                        <Button variant="ghost" size="icon" className="text-[#5E6C5B] hover:text-[#4C584A] hover:bg-[#D3CBB8]/30 transition-transform active:scale-95">
                          <SkipBack className="w-7 h-7 fill-current" />
                        </Button>
                        <Button 
                          size="icon" 
                          className="h-16 w-16 rounded-full bg-[#5E6C5B] hover:bg-[#4C584A] text-white shadow-xl shadow-[#5E6C5B]/30 transition-all hover:scale-105 active:scale-95"
                          onClick={togglePlay}
                        >
                          {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="text-[#5E6C5B] hover:text-[#4C584A] hover:bg-[#D3CBB8]/30 transition-transform active:scale-95">
                          <SkipForward className="w-7 h-7 fill-current" />
                        </Button>
                      </div>
                      
                      <div className="w-full space-y-2">
                        <div 
                          className="w-full h-2 bg-[#D3CBB8]/50 rounded-full overflow-hidden relative cursor-pointer group"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const percent = (e.clientX - rect.left) / rect.width;
                            if (audioRef.current) audioRef.current.currentTime = percent * duration;
                          }}
                        >
                          <div 
                            className="absolute h-full bg-[#5E6C5B] rounded-full shadow-[0_0_12px_rgba(94,108,91,0.4)] transition-all duration-100" 
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                          />
                        </div>
                        <div className="flex justify-between w-full px-1">
                          <span className="text-[10px] tabular-nums font-black text-[#7A756B] tracking-widest">{formatTime(currentTime)}</span>
                          <span className="text-[10px] tabular-nums font-black text-[#7A756B] tracking-widest">{formatTime(duration)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 w-72 justify-end pr-4 text-[#5E6C5B] relative">
                      <Volume2 className="w-5 h-5 opacity-60" />
                      <div className="w-24 h-1.5 bg-[#D3CBB8] rounded-full relative">
                          <div className="absolute h-full w-[80%] bg-[#5E6C5B] rounded-full shadow-sm" />
                      </div>
                    </div>

                    <audio ref={audioRef} src={podcast.audioUrl} hidden />
                  </div>
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
               <motion.div 
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="max-w-md w-full text-center space-y-10"
               >
                 <div className="relative mx-auto w-40 h-40">
                    <div className="absolute inset-0 bg-[#D3CBB8]/20 rounded-[3rem] rotate-12" />
                    <div className="absolute inset-0 bg-[#EBE9E1] rounded-[3rem] -rotate-6 flex items-center justify-center shadow-2xl border border-white">
                      <Sparkles className="w-16 h-16 text-[#5E6C5B]" />
                    </div>
                 </div>
                 <div className="space-y-4">
                    <h3 className="text-4xl font-extrabold tracking-tighter text-[#33302E]">Ready for your Dialogue?</h3>
                    <p className="text-[#7A756B] text-base leading-relaxed px-6 font-medium opacity-80">
                      Upload your knowledge sources below. Our expert AI hosts Joe and Jane are ready to synthesize them into a polished conversation.
                    </p>
                 </div>
                 <div className="pt-4">
                    <Button 
                      className="bg-[#5E6C5B] hover:bg-[#4C584A] text-white h-14 px-10 rounded-full font-bold shadow-xl shadow-[#5E6C5B]/20 transition-all hover:scale-105"
                      onClick={() => (document.getElementById('add-source-modal') as any)?.showModal()}
                    >
                      <Plus className="w-5 h-5 mr-3" />
                      Add Knowledge Source
                    </Button>
                 </div>
               </motion.div>
            </div>
          )}
        </div>
      </main>

      {/* Natural Tones Add Source Modal */}
      <dialog id="add-source-modal" className="modal bg-transparent p-0 overflow-visible">
        <div className="fixed inset-0 bg-[#33302E]/60 backdrop-blur-xl flex items-center justify-center p-6 z-[100]">
          <Card className="w-full max-w-2xl border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] bg-[#FDFDFB] animate-in zoom-in-95 fade-in duration-300 rounded-[3rem] overflow-hidden">
            <CardHeader className="p-12 pb-6 flex flex-row items-start justify-between">
              <div>
                <Badge variant="outline" className="mb-4 border-[#D3CBB8] text-[#5E6C5B] uppercase tracking-[0.2em] text-[10px] font-black px-4 py-1.5 bg-[#5E6C5B]/5">Source Entry</Badge>
                <CardTitle className="text-4xl font-black tracking-tighter text-[#33302E]">Context Knowledge</CardTitle>
                <CardDescription className="text-lg font-medium text-[#7A756B] mt-2">What should our hosts deep dive into?</CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-12 w-12 rounded-full hover:bg-[#EBE9E1] transition-all"
                onClick={() => (document.getElementById('add-source-modal') as any)?.close()}
              >
                <X className="w-6 h-6 text-[#7A756B]" />
              </Button>
            </CardHeader>
            <CardContent className="px-12 space-y-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-[#7A756B] px-1">Resource Title</label>
                <Input 
                  placeholder="e.g., Quantum Computing Basics" 
                  value={newSourceTitle}
                  onChange={(e) => setNewSourceTitle(e.target.value)}
                  className="h-16 bg-[#EBE9E1]/30 border-[#E0DED3] focus:bg-white focus:border-[#5E6C5B] focus:ring-0 rounded-2xl px-6 text-xl font-bold placeholder:font-medium transition-all"
                />
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-[#7A756B] px-1">Core Document / Notes</label>
                <Textarea 
                  placeholder="Paste your source materials here. Joe and Jane will use this to structure their conversation." 
                  className="min-h-[260px] bg-[#EBE9E1]/30 border-[#E0DED3] focus:bg-white focus:border-[#5E6C5B] focus:ring-0 rounded-[2.5rem] p-8 text-xl font-medium leading-relaxed resize-none transition-all placeholder:text-[#D3CBB8]"
                  value={newSourceContent}
                  onChange={(e) => setNewSourceContent(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="p-12 pt-4 flex justify-end gap-4">
              <Button 
                variant="ghost" 
                className="h-16 px-10 rounded-full font-bold text-[#7A756B] hover:bg-[#EBE9E1] text-lg"
                onClick={() => (document.getElementById('add-source-modal') as any)?.close()}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  addSource();
                  (document.getElementById('add-source-modal') as any)?.close();
                }}
                disabled={!newSourceTitle || !newSourceContent}
                className="h-16 px-14 rounded-full bg-[#5E6C5B] hover:bg-[#4C584A] text-white font-bold text-xl shadow-2xl shadow-[#5E6C5B]/30 transition-all disabled:opacity-20"
              >
                Add Knowledge
              </Button>
            </CardFooter>
          </Card>
        </div>
      </dialog>

      {/* Global Utility Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        
        dialog::backdrop {
          display: none;
        }
        .modal[open] {
          display: block;
        }
        
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #E6E1D6;
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #D7D1C5;
        }
      `}} />
    </div>
  );
}
