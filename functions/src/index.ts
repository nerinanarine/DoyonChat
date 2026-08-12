import { app } from '@azure/functions';
import './functions/health';
import './functions/models';
import './functions/conversations';
import './functions/messages';
import './functions/chat';

app.setup({ enableHttpStream: true });
