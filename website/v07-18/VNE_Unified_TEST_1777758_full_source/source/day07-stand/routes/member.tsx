import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyMembershipQuestionnaires } from "@/lib/questionnaire.functions";
import { clearDraftForSignout } from "@/lib/questionnaire-draft-session";
import { signOut } from "@/lib/auth/auth.functions";
import { MembershipIntakeStatus } from "@/components/member/MembershipIntakeStatus";
import { MemberPasses } from "@/components/admission/MemberPasses";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/member")({
  loader: () => getMyMembershipQuestionnaires(),
  component: Member,
});
function Member() {
  const state = Route.useLoaderData(),
    out = useServerFn(signOut),
    navigate = useNavigate(),
    router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <>
      <MembershipIntakeStatus state={state} />
      <MemberPasses />
      <div className="my-6 flex gap-4">
        <Button onClick={() => void router.invalidate()}>Обновить статус</Button>
        <Button
          variant="outline"
          onClick={async () => {
            clearDraftForSignout();
            try {
              const result = await out({ data: {} });
              if (result.ok) {
                clearDraftForSignout();
                await navigate({ to: "/login", replace: true });
              } else setMessage(result.message);
            } catch {
              setMessage("Выход не выполнен. Повторите попытку.");
            }
          }}
        >
          Выйти
        </Button>
      </div>
      <p role="status">{message}</p>
    </>
  );
}
