// Janela de confirmação no visual do site (no lugar do confirm() do navegador).
import { isBackdropClick } from './utils.js';

const dialog = document.getElementById('confirm-dialog');

/**
 * Pergunta e devolve true se a pessoa confirmar.
 * Esc, "Cancelar" e clique fora da caixa contam como "não".
 * A resposta sai direto do clique (não espera o evento "close" do <dialog>,
 * que alguns navegadores só disparam no próximo quadro de tela).
 */
export function askConfirm({ title, text = '', confirmLabel = 'Confirmar' }) {
  if (!dialog) return Promise.resolve(window.confirm(title));
  dialog.querySelector('#confirm-title').textContent = title;
  dialog.querySelector('#confirm-text').textContent = text;
  dialog.querySelector('#confirm-text').hidden = !text;
  dialog.querySelector('button[value="yes"]').textContent = confirmLabel;
  dialog.showModal();
  dialog.querySelector('button[value="no"]').focus();

  return new Promise((resolve) => {
    const done = (answer) => {
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      resolve(answer);
    };
    const onClick = (e) => {
      const button = e.target.closest('button[value]');
      if (button) done(button.value === 'yes');
      else if (isBackdropClick(dialog, e)) done(false);
    };
    const onCancel = (e) => {
      e.preventDefault();
      done(false);
    };
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('cancel', onCancel);
  });
}
