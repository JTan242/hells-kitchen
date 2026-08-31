import { ErrorBox } from '@/components/ErrorBox';

export default function NotFound() {
  return <ErrorBox title="Not found" message="That page or recipe does not exist." />;
}
