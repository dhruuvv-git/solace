/** What brings someone to Solace — shared by onboarding, the dashboard and the API (server/app.mjs CONCERNS). */
import { ShieldAlert, Image as ImageIcon, UserX, MessageSquareWarning, Banknote, Compass } from 'lucide-react';

export const CONCERNS = [
  { id: 'intimate-images', icon: ShieldAlert, title: 'Intimate images shared or threatened', body: 'Private photos or videos posted, or someone threatening to.' },
  { id: 'deepfake', icon: ImageIcon, title: 'A deepfake or morphed image of me', body: 'Fake or edited pictures or videos using my face.' },
  { id: 'impersonation', icon: UserX, title: 'Someone pretending to be me', body: 'A fake profile using my name or photos.' },
  { id: 'harassment', icon: MessageSquareWarning, title: 'Harassment or bullying', body: 'Repeated abusive messages, comments or calls.' },
  { id: 'extortion', icon: Banknote, title: 'Blackmail or extortion', body: 'Demands for money, photos or favours under threat.' },
  { id: 'exploring', icon: Compass, title: 'Just exploring Solace', body: 'Nothing urgent — I want to be prepared.' },
];
