import { app } from '@azure/functions';
import './functions/health';
import './functions/models';
import './functions/conversations';
import './functions/messages';
import './functions/chat';
import './functions/users';

app.setup({ enableHttpStream: true });
