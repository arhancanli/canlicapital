// A conceptual research packet, not a mock live result. Shared lower-page scene.
export function renderOpticalHandoff() {
  return `<section class="cc-handoff" aria-labelledby="cc-handoff-title">
    <div class="cc-handoff__viewport">
      <div class="cc-handoff__intro"><p>Research → Validation → Publication</p><h2 id="cc-handoff-title">From an idea.<br />To a record.</h2><p>Carry the inputs, assumptions and limits with the result. The evidence should survive every handoff.</p></div>
      <div class="cc-handoff__stage" aria-hidden="true">
        <svg class="cc-handoff__route" viewBox="0 0 1000 300" preserveAspectRatio="none"><path class="cc-handoff__track" d="M120 210C280 210 310 85 500 85S720 210 880 210"/><path class="cc-handoff__trace" pathLength="1" d="M120 210C280 210 310 85 500 85S720 210 880 210"/></svg>
        <div class="cc-handoff__dock cc-handoff__dock--inputs"><i></i><i></i><i></i></div>
        <div class="cc-handoff__gate"><i></i><i></i><i></i></div>
        <div class="cc-handoff__dock cc-handoff__dock--record"><i></i><i></i><i></i></div>
        <div class="cc-handoff__packet">
          <img src="/cinema/optical-master-v3-1536.webp" width="1536" height="1536" loading="lazy" alt="" />
        </div>
      </div>
      <div class="cc-handoff__steps">
        <a href="/research" data-handoff-step="0"><span>Define</span><strong>The research packet</strong><small>Inputs, rules and the failed trials.</small><em>Inspect the research ↗</em></a>
        <a href="/developers#validation" data-handoff-step="1"><span>Reproduce</span><strong>The calculation receipt</strong><small>Your inputs. Declared arithmetic.</small><em>Explore the validation API ↗</em></a>
        <a href="/verify" data-handoff-step="2"><span>Inspect</span><strong>The published record</strong><small>Sources, corrections and boundaries.</small><em>Verify the evidence ↗</em></a>
      </div>
      <p class="cc-handoff__boundary">Conceptual workflow. This animation sends no request. A receipt is not proof of future returns.</p>
    </div>
  </section>`;
}
