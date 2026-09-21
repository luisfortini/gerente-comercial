type Props = {
  defaultValue?: 'P' | 'R';
  label?: string;
  name?: string;
};

const opcoes = [
  { valor: 'P', descricao: 'Presencial' },
  { valor: 'R', descricao: 'Remoto' },
] as const;

export function TipoInteracaoRadio({ defaultValue = 'R', label = 'Tipo de interação', name = 'tipoInteracao' }: Props) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {opcoes.map(opcao => (
          <label key={opcao.valor} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800">
            <input
              required
              type="radio"
              name={name}
              value={opcao.valor}
              defaultChecked={defaultValue === opcao.valor}
              className="h-4 w-4 accent-brand-600"
            />
            <span>{opcao.descricao}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
