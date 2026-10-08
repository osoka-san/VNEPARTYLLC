import { createFileRoute } from "@tanstack/react-router";
import { AdminAdmissionPanel } from "@/components/admission/AdminAdmissionPanel";
export const Route = createFileRoute("/admin/tickets")({ component: AdminAdmissionPanel });
