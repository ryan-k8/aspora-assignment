import 'module-alias/register';
import { createApp } from '@/app';

const application = createApp();

const PORT = process.env.PORT || 3000;

application.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
