"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Mail } from "lucide-react";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<any>(null);
  const [sequences, setSequences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/campaigns/${id}`).then((r) => r.json()),
      fetch(`/api/sequences?campaign_id=${id}`).then((r) => r.json()),
    ]).then(([camp, seqs]) => {
      setCampaign(camp?.error ? null : camp);
      setSequences(Array.isArray(seqs) ? seqs : []);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="text-zinc-500">Loading...</div>;
  if (!campaign) return <div className="text-red-500">Campaign not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          {campaign.description && (
            <p className="mt-1 text-sm text-zinc-500">{campaign.description}</p>
          )}
        </div>
        <Link href={`/campaigns/${id}/enroll`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Sequence
          </Button>
        </Link>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-500">
            No sequences yet.{" "}
            <Link href={`/campaigns/${id}/enroll`} className="text-blue-600 hover:underline">
              Create the first one
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Next Send</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sequences.map((seq: any) => (
              <TableRow key={seq.id}>
                <TableCell>
                  <Link href={`/sequences/${seq.id}`} className="font-medium text-blue-600 hover:underline">
                    {seq.contact?.firstName} {seq.contact?.lastName}
                  </Link>
                  <div className="text-xs text-zinc-500">{seq.contact?.email}</div>
                </TableCell>
                <TableCell>{seq.contact?.company || "—"}</TableCell>
                <TableCell>{seq.template?.name || <span className="text-zinc-400">manual</span>}</TableCell>
                <TableCell>
                  <Badge variant={seq.status === "active" ? "default" : seq.status === "finished" ? "outline" : "secondary"}>
                    {seq.status}
                  </Badge>
                </TableCell>
                <TableCell>{seq.stepCount ?? "—"}</TableCell>
                <TableCell>
                  {seq.nextScheduledAt
                    ? new Date(seq.nextScheduledAt).toLocaleDateString()
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
