"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, MousePointerClick, Eye, MessageSquare, AlertTriangle } from "lucide-react";

interface ContactSheetProps {
  contactId: string | null;
  onClose: () => void;
}

const statusVariant: Record<string, any> = {
  active: "default",
  finished: "outline",
  paused: "secondary",
  failed: "destructive",
};

export function ContactSheet({ contactId, onClose }: ContactSheetProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contactId) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/contacts/${contactId}/details`)
      .then((r) => r.json())
      .then((d) => {
        setData(d.error ? null : d);
        setLoading(false);
      });
  }, [contactId]);

  const contact = data?.contact;
  const sequences = data?.sequences ?? [];
  const stats = data?.stats ?? {};

  return (
    <Sheet
      open={!!contactId}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg w-full p-0 flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            Loading...
          </div>
        ) : !contact ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            Contact not found
          </div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-0">
              <SheetTitle className="text-lg">
                {contact.firstName} {contact.lastName}
              </SheetTitle>
              <SheetDescription className="flex flex-col gap-1">
                <span>{contact.email}</span>
                {(contact.company || contact.title) && (
                  <span>
                    {contact.title}
                    {contact.title && contact.company ? " at " : ""}
                    {contact.company}
                  </span>
                )}
              </SheetDescription>
              <div className="flex gap-2 pt-1">
                <Badge
                  variant={
                    contact.status === "active"
                      ? "default"
                      : contact.status === "bounced"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {contact.status}
                </Badge>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {/* Stats */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-500 mb-3">Activity</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard icon={Mail} label="Sent" value={stats.totalEmails} />
                    <StatCard icon={Eye} label="Opens" value={stats.opens} />
                    <StatCard icon={MousePointerClick} label="Clicks" value={stats.clicks} />
                    <StatCard icon={MessageSquare} label="Replies" value={stats.replies} />
                  </div>
                </div>

                <Separator />

                {/* Sequences */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-500 mb-3">
                    Sequences ({sequences.length})
                  </h3>
                  {sequences.length === 0 ? (
                    <p className="text-sm text-zinc-400">No sequences</p>
                  ) : (
                    <div className="space-y-4">
                      {sequences.map((seq: any) => (
                        <div key={seq.id} className="border rounded-lg p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <Link
                              href={`/sequences/${seq.id}`}
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              #{seq.id.slice(0, 8)}
                            </Link>
                            <Badge variant={statusVariant[seq.status] || "outline"}>
                              {seq.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                            {seq.campaign && (
                              <Link
                                href={`/campaigns/${seq.campaign.id}`}
                                className="hover:underline"
                              >
                                Campaign: {seq.campaign.name}
                              </Link>
                            )}
                            {seq.template && (
                              <span>Template: {seq.template.name}</span>
                            )}
                            <span>{seq.totalSteps} steps</span>
                          </div>

                          {/* Emails in this sequence */}
                          {seq.emails.length > 0 && (
                            <div className="space-y-2">
                              {seq.emails.map((email: any) => (
                                <div
                                  key={email.id}
                                  className="bg-zinc-50 dark:bg-zinc-900 rounded p-2 space-y-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium truncate flex-1 mr-2">
                                      {email.subject || "(no subject)"}
                                    </span>
                                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                                      {new Date(email.sentAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                  {email.events.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {email.events.map((ev: any, i: number) => (
                                        <Badge
                                          key={i}
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          {ev.type}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Icon className="h-4 w-4 text-zinc-500" />
      <div>
        <div className="text-lg font-semibold">{value ?? 0}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  );
}
