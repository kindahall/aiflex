"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Participant {
  id: string;
  name: string;
  avatarSeed?: string;
}

interface ConversationItem {
  id: string;
  participantIds: string[];
  lastMessageAt: number;
  participants: Participant[];
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  read: boolean;
  createdAt: number;
}

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const activeConvId = searchParams.get("c");

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) setCurrentUserId(d.user.id); });
  }, []);

  useEffect(() => {
    fetch("/api/messages")
      .then((r) => r.json())
      .then((d) => {
        setConversations(d.conversations || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeConvId) return;
    fetch(`/api/messages/${activeConvId}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []));
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !activeConvId) return;

    const res = await fetch(`/api/messages/${activeConvId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newMessage.trim() }),
    });
    const data = await res.json();
    if (data.message) {
      setMessages((prev) => [...prev, data.message]);
      setNewMessage("");
    }
  }

  const activeConv = conversations.find((c) => c.id === activeConvId);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-flex-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-flex-text mb-6">
        Messages
      </h1>

      <div className="flex rounded-2xl border border-flex-border overflow-hidden bg-flex-card" style={{ height: "70vh" }}>
        {/* Sidebar — conversation list */}
        <div className="w-80 border-r border-flex-border overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-flex-muted text-sm">
              Aucune conversation
            </div>
          ) : (
            conversations.map((conv) => {
              const other = conv.participants[0];
              const isActive = conv.id === activeConvId;
              return (
                <Link
                  key={conv.id}
                  href={`/messages?c=${conv.id}`}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-flex-border transition ${
                    isActive
                      ? "bg-flex-accent/10"
                      : "hover:bg-flex-surface"
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-flex-accent/20 flex items-center justify-center text-sm font-bold text-flex-accent shrink-0">
                    {other?.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-flex-text truncate">
                      {other?.name || "Utilisateur"}
                    </div>
                    <div className="text-xs text-flex-muted">
                      {new Date(conv.lastMessageAt).toLocaleDateString("fr")}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Main — messages */}
        <div className="flex flex-1 flex-col">
          {!activeConvId ? (
            <div className="flex flex-1 items-center justify-center text-flex-muted">
              Sélectionne une conversation
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="border-b border-flex-border px-6 py-4">
                <h2 className="font-semibold text-flex-text">
                  {activeConv?.participants[0]?.name || "Conversation"}
                </h2>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {messages.map((msg) => {
                  const isMine = msg.senderId === currentUserId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                          isMine
                            ? "bg-flex-accent text-white"
                            : "bg-flex-surface text-flex-text"
                        }`}
                      >
                        {msg.body}
                        <div
                          className={`text-[10px] mt-1 ${
                            isMine ? "text-white/60" : "text-flex-muted"
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString("fr", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSend}
                className="border-t border-flex-border px-4 py-3 flex gap-3"
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Écrire un message..."
                  className="flex-1 rounded-full bg-flex-surface px-4 py-2.5 text-sm text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="rounded-full bg-flex-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-flex-accent/90 disabled:opacity-50"
                >
                  Envoyer
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
