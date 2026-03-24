"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function DashboardPage() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/sequences?per_page=100").then((r) => r.json()),
      fetch("/api/mailboxes").then((r) => r.json()),
    ]).then(([seqs, mbs]) => {
      setSequences(Array.isArray(seqs) ? seqs : []);
      setMailboxes(Array.isArray(mbs) ? mbs : []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-zinc-500">Loading dashboard...</div>;

  const active = sequences.filter((s) => s.status === "active").length;
  const finished = sequences.filter((s) => s.status === "finished").length;
  const replied = sequences.filter((s) => s.finishedReason === "replied").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/sequences/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Sequence
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Total Sequences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sequences.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Finished</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{finished}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Replies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{replied}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent sequences */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Sequences</h2>
        {sequences.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-zinc-500">
              No sequences yet.{" "}
              <Link href="/sequences/new" className="text-blue-600 hover:underline">
                Create your first one
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sequences.slice(0, 9).map((seq: any) => (
              <Link key={seq.id} href={`/sequences/${seq.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium truncate">
                        {seq.contact?.firstName} {seq.contact?.lastName}
                      </div>
                      <Badge variant={seq.status === "active" ? "default" : seq.status === "finished" ? "outline" : "secondary"} className="ml-2 shrink-0">
                        {seq.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 truncate">
                      {seq.contact?.company || seq.contact?.email}
                    </div>
                    {seq.campaign && (
                      <div className="mt-1 text-xs text-zinc-400">{seq.campaign.name}</div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Mailbox health */}
      {mailboxes.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Mailboxes</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {mailboxes.map((mb: any) => (
              <Card key={mb.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <span className="text-sm font-medium">{mb.email}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{mb.dailyLimit}/day</span>
                    <Badge variant={mb.isActive ? "default" : "secondary"}>
                      {mb.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
