const noRawThrow = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw Error/ORPCError throws in router-reachable code. Use OmnarrError with a typed code from @/shared/errors.',
    },
  },
  create(context) {
    return {
      ThrowStatement(node) {
        const arg = node.argument

        if (!arg || arg.type !== 'NewExpression') {
          return
        }

        if (arg.callee?.type !== 'Identifier') {
          return
        }

        const name = arg.callee.name

        if (name !== 'Error' && name !== 'ORPCError') {
          return
        }

        context.report({
          node: arg,
          message: `Do not throw '${name}' in router-reachable code. Import { OmnarrError } from '@/shared/errors' and throw a typed code instead.`,
        })
      },
    }
  },
}

const plugin = {
  meta: {
    name: 'omnarr',
  },
  rules: {
    'no-raw-throw': noRawThrow,
  },
}

export default plugin
