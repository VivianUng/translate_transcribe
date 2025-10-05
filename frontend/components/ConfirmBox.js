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

export function confirmExit(message) {
  return new Promise((resolve) => {

    confirmAlert({
      title: 'Confirm Exit',
      message,
      buttons: [
        {
          label: 'Leave',
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
