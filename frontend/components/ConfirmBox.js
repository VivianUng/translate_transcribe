import { confirmAlert } from 'react-confirm-alert';
import 'react-confirm-alert/src/react-confirm-alert.css';

export function confirmDeletion(message) {
  return new Promise((resolve) => {

    confirmAlert({
      title: 'Confirm Deletion',
      message,
      buttons: [
        {
          label: 'Delete',
          onClick: () => resolve(true)
        },
        {
          label: 'Cancel',
          onClick: () => resolve(false)
        }
      ],
      closeOnEscape: true,
      closeOnClickOutside: true
    });
  });
}
