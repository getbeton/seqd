"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function RepliesPage() {
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/replies")
      .then((r) => r.json())
      .then((data) => {
        setReplies(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Replies</h1>

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : replies.length === 0 ? (
        <div className="py-12 text-center text-zinc-500">
          No replies received yet. Replies will appear here when contacts respond to your sequences.
        </div>
      ) : (
        <div className="space-y-3">
          {replies.map((reply) => (
            <Card key={reply.event.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">
                      {reply.contact.firstName} {reply.contact.lastName}
                      {reply.contact.company && (
                        <span className="text-zinc-500"> @ {reply.contact.company}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {reply.campaign.name}
                      {reply.step && ` · Step ${reply.step.stepNumber}`}
                      {" · "}
                      {new Date(reply.event.occurredAt).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant="outline">reply</Badge>
                </div>
                {reply.event.replyText && (
                  <div className="mt-3 rounded bg-zinc-50 p-3 text-sm whitespace-pre-wrap dark:bg-zinc-900">
                    {reply.event.replyText.slice(0, 500)}
                    {reply.event.replyText.length > 500 && "..."}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
