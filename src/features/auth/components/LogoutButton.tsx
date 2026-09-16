import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/Button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" fullWidth>
        Log out
      </Button>
    </form>
  );
}
