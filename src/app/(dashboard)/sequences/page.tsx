"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { ContactSheet } from "@/components/contact-sheet";

const statusVariant: Record<string, any> = {
  active: "default",
  finished: "outline",
  paused: "secondary",
  failed: "destructive",
};

export default function SequencesPage() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  function load(status = "") {
    setLoading(true);
    fetch(`/api/sequences?per_page=100${status ? `&status=${status}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        setSequences(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, []);

  function handleFilter(s: string) {
    setStatusFilter(s);
    load(s);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sequences</h1>
        <Link href="/sequences/new">
          <Button><Plus className="mr-2 h-4 w-4" />New Sequence</Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-2">
        {["", "active", "paused", "finished", "failed"].map((s) => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"}
            onClick={() => handleFilter(s)}>
            {s || "All"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : (() => {
        const q = search.toLowerCase();
        const filtered = sequences.filter((seq: any) => {
          if (!q) return true;
          const name = `${seq.contact?.firstName ?? ""} ${seq.contact?.lastName ?? ""}`.toLowerCase();
          const email = (seq.contact?.email ?? "").toLowerCase();
          const company = (seq.contact?.company ?? "").toLowerCase();
          return name.includes(q) || email.includes(q) || company.includes(q);
        });
        return filtered.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            {sequences.length === 0 ? "No sequences yet." : "No sequences match your search."}
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sequence</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Next Send</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((seq: any) => (
              <TableRow key={seq.id}>
                <TableCell>
                  <Link href={`/sequences/${seq.id}`} className="font-medium text-blue-600 hover:underline">
                    #{seq.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => setSelectedContactId(seq.contact?.id)}
                    className="font-medium text-blue-600 hover:underline text-left"
                  >
                    {seq.contact?.firstName} {seq.contact?.lastName}
                  </button>
                  <div className="text-xs text-zinc-500">
                    <button
                      onClick={() => setSelectedContactId(seq.contact?.id)}
                      className="hover:underline"
                    >
                      {seq.contact?.email}
                    </button>
                  </div>
                </TableCell>
                <TableCell>{seq.contact?.company || "—"}</TableCell>
                <TableCell>
                  {seq.campaign ? (
                    <Link href={`/campaigns/${seq.campaign.id}`} className="text-sm hover:underline">
                      {seq.campaign.name}
                    </Link>
                  ) : "—"}
                </TableCell>
                <TableCell>{seq.template?.name || <span className="text-zinc-400">manual</span>}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[seq.status] || "outline"}>{seq.status}</Badge>
                </TableCell>
                <TableCell>{seq.stepCount ?? "—"}</TableCell>
                <TableCell>
                  {seq.nextScheduledAt ? new Date(seq.nextScheduledAt).toLocaleDateString() : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        );
      })()}

      <ContactSheet
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
      />
    </div>
  );
}
