// Maquettes statiques — petits comportements partagés (thème, bascules d'affichage).

(function () {
  const root = document.documentElement;

  // ---------------------------------------------------------------- thème
  //
  // Choix « system » (défaut), « light » ou « dark », réglé dans Paramètres > Préférences
  // (boutons `data-theme-choice`). « system » suit le réglage clair / sombre de l'ordinateur,
  // y compris s'il change pendant que la page est ouverte.
  const systemLight = window.matchMedia('(prefers-color-scheme: light)');

  function readChoice() {
    try {
      const stored = localStorage.getItem('mockup-theme');
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  let themeChoice = readChoice();

  function applyTheme() {
    const resolved = themeChoice === 'system' ? (systemLight.matches ? 'light' : 'dark') : themeChoice;
    root.dataset.theme = resolved;
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeChoice === themeChoice);
    });
  }

  applyTheme();
  systemLight.addEventListener('change', () => {
    if (themeChoice === 'system') applyTheme();
  });

  document.addEventListener('click', (event) => {
    const themeBtn = event.target.closest('[data-theme-choice]');
    if (themeBtn) {
      themeChoice = themeBtn.dataset.themeChoice;
      try {
        localStorage.setItem('mockup-theme', themeChoice);
      } catch {
        /* stockage indisponible : le choix reste valable pour la page courante */
      }
      applyTheme();
      return;
    }

    // Groupes segmentés : un seul bouton actif ; `data-show` affiche les éléments `data-group-value`.
    const segBtn = event.target.closest('.segmented button, .subnav button');
    if (segBtn) {
      const group = segBtn.closest('.segmented, .subnav');
      group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === segBtn));
      const name = group.dataset.group;
      if (name) {
        document.querySelectorAll(`[data-group="${name}"][data-value]`).forEach((el) => {
          el.hidden = el.dataset.value !== segBtn.dataset.value;
        });
      }
    }

    const row = event.target.closest('tr[data-href]');
    if (row) window.location.href = row.dataset.href;
  });

  // ---------------------------------------------------------------- modale de confirmation
  //
  // Tout élément portant `data-confirm-title` ouvre une modale avant d'agir. Attributs :
  //   data-confirm-title / data-confirm-body — textes ({ticker} = ticker de la ligne du tableau) ;
  //   data-confirm-ok — libellé du bouton de confirmation ; data-confirm-danger — action destructive.
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm';
  dialog.innerHTML = `
    <form method="dialog">
      <div class="confirm-body">
        <span class="confirm-icon"><span class="icon"></span></span>
        <div><h3></h3><p></p></div>
      </div>
      <div class="confirm-actions">
        <button class="btn" value="cancel">Annuler</button>
        <button class="btn btn-primary" value="ok"></button>
      </div>
    </form>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(dialog));

  document.addEventListener(
    'click',
    (event) => {
      const trigger = event.target.closest('[data-confirm-title]');
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      const ticker = trigger.closest('tr')?.querySelector('.ticker')?.textContent.trim() ?? '';
      const fill = (s) => (s || '').replaceAll('{ticker}', ticker);
      const danger = trigger.hasAttribute('data-confirm-danger');
      dialog.classList.toggle('danger', danger);
      dialog.querySelector('.confirm-icon .icon').textContent = danger ? 'delete' : 'help';
      dialog.querySelector('h3').textContent = fill(trigger.dataset.confirmTitle);
      dialog.querySelector('p').textContent = fill(trigger.dataset.confirmBody);
      const ok = dialog.querySelector('[value="ok"]');
      ok.textContent = trigger.dataset.confirmOk || 'Confirmer';
      ok.className = danger ? 'btn btn-danger' : 'btn btn-primary';
      dialog.showModal();
    },
    true,
  );
})();
