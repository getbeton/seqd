"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function EnrollPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contacts, setContacts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/contacts?limit=200&search=${search}`)
      .then((r) => r.json())
      .then((data) => {
        setContacts(data.data || []);
        setLoading(false);
      });
  }, [search]);

  function toggleAll() {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map((c) => c.id)));
    }
  }

  function toggleContact(contactId: string) {
    const next = new Set(selected);
    if (next.has(contactId)) {
      next.delete(contactId);
    } else {
      next.add(contactId);
    }
    setSelected(next);
  }

  async function handleEnroll() {
    setEnrolling(true);
    const res = await fetch(`/api/campaigns/${id}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids: Array.from(selected) }),
    });
    const data = await res.json();
    setEnrolling(false);
    if (!res.ok) {
      toast.error(data.error || "Enrollment failed");
      return;
    }
    setResult(data);
    if (data.enrolled > 0) {
      toast.success(`Enrolled ${data.enrolled} contacts`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Enroll Contacts</h1>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Enrollment Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-lg font-bold text-green-600">
              {result.enrolled} enrolled
            </div>
            {result.skipped && (
              <div className="text-sm text-zinc-500">
                Skipped: {Object.entries(result.skipped)
                  .filter(([, v]) => (v as number) > 0)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
              </div>
            )}
            {result.projections?.firstSendDate && (
              <div className="text-sm text-zinc-500">
                First sends: {result.projections.firstSendDate} | Estimated completion:{" "}
                {result.projections.estimatedCompletion}
              </div>
            )}
            <Button onClick={() => router.push(`/campaigns/${id}`)}>
              Back to Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selected.size === contacts.length ? "Deselect All" : "Select All"}
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 text-zinc-500">Loading contacts...</div>
              ) : contacts.length === 0 ? (
                <div className="p-4 text-zinc-500">No contacts found</div>
              ) : (
                <div className="divide-y max-h-96 overflow-auto">
                  {contacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(contact.id)}
                        onCheckedChange={() => toggleContact(contact.id)}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {contact.firstName} {contact.lastName}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {contact.email}
                          {contact.company && ` · ${contact.company}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-500">
              {selected.size} contact{selected.size !== 1 ? "s" : ""} selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button
                onClick={handleEnroll}
                disabled={selected.size === 0 || enrolling}
              >
                {enrolling ? "Enrolling..." : `Enroll ${selected.size} contacts`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
