export function mapAuthError(message: string): string {
  switch (true) {
    case message.includes('Invalid login credentials'):
      return 'メールアドレスまたはパスワードが正しくありません。';
    case message.includes('Email not confirmed'):
      return 'メールアドレスが確認されていません。確認メールをご確認ください。';
    case message.includes('User already registered'):
      return 'このメールアドレスは既に登録されています。';
    case message.includes('Password should be at least'):
      return 'パスワードが短すぎます。';
    case message.includes('rate limit'):
      return 'リクエストが多すぎます。しばらく待ってからお試しください。';
    default:
      return '認証エラーが発生しました。もう一度お試しください。';
  }
}
