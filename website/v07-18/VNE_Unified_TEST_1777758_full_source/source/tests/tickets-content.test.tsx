import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import PassView from "../src/components/tickets/PassView";
import { makeDemoPass, PASS_ACCESS } from "../src/components/tickets/ticket-designs";

test("long synthetic pass values remain complete outside the fixed-size card", () => {
  for (const type of PASS_ACCESS) {
    const pass = makeDemoPass(type);
    pass.name = "И".repeat(120);
    pass.event.title = "С".repeat(180);
    pass.event.meetingPoint = "А".repeat(300);
    pass.ticketCode = "T".repeat(128);
    const html = renderToStaticMarkup(<PassView pass={pass} />);
    const details = html.match(/<details class="vne-pass-details">[\s\S]*?<\/details>/)?.[0];
    expect(details).toBeDefined();
    for (const value of [pass.name, pass.event.title, pass.event.meetingPoint, pass.ticketCode]) {
      expect(details).toContain(value);
    }
    expect(details).toContain("Полные данные пропуска");
  }
});
