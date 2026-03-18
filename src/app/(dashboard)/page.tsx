"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns").then((r) => r.json()),
      fetch("/api/mailboxes").then((r) => r.json()),
    ]).then(([camps, mbs]) => {
      setCampaigns(Array.isArray(camps) ? camps : []);
      setMailboxes(Array.isArray(mbs) ? mbs : []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-zinc-500">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/campaigns/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns.filter((c) => c.status === "active").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Connected Mailboxes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mailboxes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              Total Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns list */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Campaigns</h2>
        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-zinc-500">
              No campaigns yet.{" "}
              <Link href="/campaigns/new" className="text-blue-600 hover:underline">
                Create your first campaign
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{campaign.name}</CardTitle>
                      <Badge
                        variant={
                          campaign.status === "active"
                            ? "default"
                            : campaign.status === "paused"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {campaign.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-zinc-500">
                      {campaign.timezone} | {campaign.sendingWindowStart}–{campaign.sendingWindowEnd}
                    </div>
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
          <h2 className="mb-3 text-lg font-semibold">Mailbox Health</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {mailboxes.map((mb: any) => (
              <Card key={mb.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{mb.email}</span>
                    <Badge variant={mb.isActive ? "default" : "secondary"}>
                      {mb.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Daily limit: {mb.dailyLimit}
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
