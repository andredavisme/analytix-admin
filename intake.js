const SUPABASE_URL = 'https://hhyhulqngdkwsxhymmcd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeWh1bHFuZ2Rrd3N4aHltbWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzEyMDEsImV4cCI6MjA5MjcwNzIwMX0.dmSy7Q8Je5lEY4XCFzwvfPnkBYLebPE0yZMhy6Y8czI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const TOTAL_STEPS = 6;
let currentStep = 1;
let sessionId = null;
let selectedTier = null;

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedId   = localStorage.getItem('analytix_session_id');
  const savedStep = parseInt(localStorage.getItem('analytix_step') || '1');
  const savedTier = localStorage.getItem('analytix_tier');

  if (savedId) {
    sessionId = savedId;
    if (savedTier) selectTier(savedTier, false);
    goToStep(Math.min(savedStep, TOTAL_STEPS));
  }

  // Capture UTM params from URL
  const params = new URLSearchParams(window.location.search);
  window._utm = {
    utm_campaign:    params.get('utm_campaign') || null,
    utm_medium:      params.get('utm_medium')   || null,
    referral_source: params.get('ref') || (document.referrer ? document.referrer : null),
  };

  // Industry "other" toggle
  document.getElementById('industry').addEventListener('change', e => {
    document.getElementById('industry-custom-field').style.display =
      e.target.value === 'other' ? 'flex' : 'none';
  });

  // Project type "custom" toggle
  document.getElementById('project-type').addEventListener('change', e => {
    document.getElementById('project-type-custom-field').style.display =
      e.target.value === 'custom' ? 'flex' : 'none';
  });
});

// ── TIER SELECTION ────────────────────────────────────────────────────────────
function selectTier(tier, save = true) {
  selectedTier = tier;
  document.getElementById('tier-discovery').classList.toggle('selected', tier === 'discovery');
  document.getElementById('tier-consultation').classList.toggle('selected', tier === 'consultation');
  if (save) localStorage.setItem('analytix_tier', tier);
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function goToStep(n) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));

  if (n > TOTAL_STEPS) {
    document.getElementById('step-thanks').classList.add('active');
    document.getElementById('step-actions').classList.add('hidden');
    return;
  }

  document.getElementById('step-' + n).classList.add('active');
  currentStep = n;
  localStorage.setItem('analytix_step', n);

  const pct = Math.round(((n - 1) / TOTAL_STEPS) * 100);
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-step-label').textContent = 'Step ' + n + ' of ' + TOTAL_STEPS;
  document.getElementById('progress-pct').textContent = pct + '%';
  document.getElementById('back-btn').disabled = n === 1;
  document.getElementById('next-btn').textContent = n === TOTAL_STEPS ? 'Submit ✓' : 'Next →';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prevStep() {
  if (currentStep > 1) goToStep(currentStep - 1);
}

async function nextStep() {
  clearErrors();
  setBusy(true);
  const ok = await saveCurrentStep();
  setBusy(false);
  if (ok) goToStep(currentStep + 1);
}

function setBusy(busy) {
  document.getElementById('next-btn').disabled = busy;
  document.getElementById('back-btn').disabled = busy || currentStep === 1;
}

function showError(stepNum, msg) {
  const el = document.getElementById('step' + stepNum + '-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function clearErrors() {
  document.querySelectorAll('.error-bar').forEach(e => e.classList.add('hidden'));
}

function setSaving(msg) {
  document.getElementById('saving-note').textContent = msg;
}

// ── SAVE EACH STEP ────────────────────────────────────────────────────────────
async function saveCurrentStep() {
  switch (currentStep) {
    case 1: return saveStep1();
    case 2: return saveStep2();
    case 3: return saveStep3();
    case 4: return saveStep4();
    case 5: return saveStep5();
    case 6: return saveStep6();
  }
  return true;
}

async function saveStep1() {
  if (!selectedTier) {
    showError(1, 'Please select a service tier to continue.');
    return false;
  }

  setSaving('Creating your session…');

  if (!sessionId) {
    const { data, error } = await db
      .schema('analytix')
      .from('intake_sessions')
      .insert({
        service_tier:    selectedTier,
        status:          'started',
        utm_campaign:    window._utm.utm_campaign,
        utm_medium:      window._utm.utm_medium,
        referral_source: window._utm.referral_source,
        completed_steps: ['tier'],
      })
      .select('id')
      .maybeSingle();

    if (error) {
      showError(1, 'Could not start session: ' + error.message);
      setSaving('');
      return false;
    }

    if (!data) {
      showError(1, 'Session was not created. Please try again.');
      setSaving('');
      return false;
    }

    sessionId = data.id;
    localStorage.setItem('analytix_session_id', sessionId);
  } else {
    await db.schema('analytix').from('intake_sessions')
      .update({ service_tier: selectedTier })
      .eq('id', sessionId);
  }

  const howDidYouHear = val('how-did-you-hear');
  if (howDidYouHear) {
    await db.schema('analytix').from('intake_notes')
      .upsert({ session_id: sessionId, how_did_you_hear: howDidYouHear }, { onConflict: 'session_id' });
  }

  setSaving('✓ Saved');
  return true;
}

async function saveStep2() {
  const firstName = val('first-name');
  const email     = val('contact-email');

  if (!firstName) { showError(2, 'First name is required.'); return false; }
  if (!email)     { showError(2, 'Email address is required.'); return false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError(2, 'Please enter a valid email address.');
    return false;
  }

  setSaving('Saving…');

  const { error } = await db.schema('analytix').from('intake_contacts')
    .upsert({
      session_id:        sessionId,
      first_name:        firstName,
      last_name:         val('last-name')         || null,
      email,
      phone:             val('contact-phone')     || null,
      city:              val('contact-city')      || null,
      state:             val('contact-state').toUpperCase() || null,
      preferred_contact: document.getElementById('preferred-contact').value,
      best_time:         val('best-time')         || null,
    }, { onConflict: 'session_id' });

  if (error) { showError(2, 'Error saving contact info: ' + error.message); setSaving(''); return false; }
  await appendStep('contact');
  setSaving('✓ Saved');
  return true;
}

async function saveStep3() {
  const businessName = val('business-name');
  const industry     = document.getElementById('industry').value;
  const stage        = document.getElementById('stage').value;

  if (!businessName) { showError(3, 'Business name is required.'); return false; }
  if (!industry)     { showError(3, 'Please select an industry.'); return false; }
  if (!stage)        { showError(3, 'Please select a business stage.'); return false; }

  setSaving('Saving…');

  const { error } = await db.schema('analytix').from('intake_business')
    .upsert({
      session_id:           sessionId,
      business_name:        businessName,
      tagline:              val('tagline')           || null,
      industry,
      industry_custom:      industry === 'other' ? (val('industry-custom') || null) : null,
      stage,
      founded_year:         intVal('founded-year'),
      num_founders:         intVal('num-founders'),
      num_employees:        intVal('num-employees'),
      annual_revenue_range: document.getElementById('annual-revenue').value || null,
      website:              val('website')           || null,
      primary_location:     val('primary-location')  || null,
    }, { onConflict: 'session_id' });

  if (error) { showError(3, 'Error saving business info: ' + error.message); setSaving(''); return false; }
  await appendStep('business');
  setSaving('✓ Saved');
  return true;
}

async function saveStep4() {
  const projectType = document.getElementById('project-type').value;
  const primaryGoal = val('primary-goal');
  const budgetRange = document.getElementById('budget-range').value;

  if (!projectType) { showError(4, 'Please select a project type.'); return false; }
  if (!primaryGoal) { showError(4, 'Primary goal is required.'); return false; }
  if (!budgetRange) { showError(4, 'Please select a budget range.'); return false; }

  setSaving('Saving…');

  const secondaryRaw = val('secondary-goals');

  const { error } = await db.schema('analytix').from('intake_project_scope')
    .upsert({
      session_id:               sessionId,
      project_type:             projectType,
      project_type_custom:      projectType === 'custom' ? (val('project-type-custom') || null) : null,
      primary_goal:             primaryGoal,
      budget_range:             budgetRange,
      desired_launch_date:      document.getElementById('launch-date').value || null,
      num_stakeholder_personas: intVal('num-personas'),
      secondary_goals:          secondaryRaw ? secondaryRaw.split('\n').filter(Boolean) : null,
      has_existing_content:     document.getElementById('has-existing-content').checked,
      has_branding_assets:      document.getElementById('has-branding-assets').checked,
      has_domain:               document.getElementById('has-domain').checked,
    }, { onConflict: 'session_id' });

  if (error) { showError(4, 'Error saving project scope: ' + error.message); setSaving(''); return false; }
  await appendStep('scope');
  setSaving('✓ Saved');
  return true;
}

async function saveStep5() {
  setSaving('Saving…');

  const { error } = await db.schema('analytix').from('intake_content_readiness')
    .upsert({
      session_id:                 sessionId,
      mission_written:            checked('cr-mission'),
      business_model_written:     checked('cr-model'),
      team_bios_written:          checked('cr-bios'),
      milestones_written:         checked('cr-milestones'),
      risk_register_written:      checked('cr-risks'),
      brand_colors_defined:       checked('cr-colors'),
      logo_ready:                 checked('cr-logo'),
      photos_ready:               checked('cr-photos'),
      interview_available:        document.getElementById('interview-available').value === 'true',
      interview_preferred_format: document.getElementById('interview-format').value,
    }, { onConflict: 'session_id' });

  if (error) { showError(5, 'Error saving readiness info: ' + error.message); setSaving(''); return false; }
  await appendStep('readiness');
  setSaving('✓ Saved');
  return true;
}

async function saveStep6() {
  const biggestChallenge = val('biggest-challenge');
  const whatSuccess      = val('what-success');

  if (!biggestChallenge) {
    showError(6, 'Please share your biggest challenge — it helps us prepare.');
    return false;
  }
  if (!whatSuccess) {
    showError(6, 'Please describe what success looks like for you.');
    return false;
  }

  setSaving('Submitting…');

  const { error: notesErr } = await db.schema('analytix').from('intake_notes')
    .upsert({
      session_id:              sessionId,
      biggest_challenge:       biggestChallenge,
      what_success_looks_like: whatSuccess,
      why_now:                 val('why-now')         || null,
      competitor_references:   val('competitor-refs') || null,
      anything_else:           val('anything-else')   || null,
    }, { onConflict: 'session_id' });

  if (notesErr) { showError(6, 'Error saving notes: ' + notesErr.message); setSaving(''); return false; }

  const { error: sessionErr } = await db.schema('analytix').from('intake_sessions')
    .update({
      status:          'submitted',
      completed_steps: ['tier', 'contact', 'business', 'scope', 'readiness', 'notes'],
      updated_at:      new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (sessionErr) { showError(6, 'Error finalizing submission: ' + sessionErr.message); setSaving(''); return false; }

  localStorage.removeItem('analytix_session_id');
  localStorage.removeItem('analytix_step');
  localStorage.removeItem('analytix_tier');

  setSaving('');
  return true;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function val(id) {
  return (document.getElementById(id).value || '').trim();
}
function intVal(id) {
  const v = document.getElementById(id).value;
  return v ? parseInt(v, 10) : null;
}
function checked(id) {
  return document.getElementById(id).checked;
}
async function appendStep(stepName) {
  await db.schema('analytix').from('intake_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}
