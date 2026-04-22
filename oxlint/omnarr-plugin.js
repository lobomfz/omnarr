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

        if (arg.callee.name !== 'Error' && arg.callee.name !== 'ORPCError') {
          return
        }

        context.report({
          node: arg,
          message: `Do not throw '${arg.callee.name}' in router-reachable code. Import { OmnarrError } from '@/shared/errors' and throw a typed code instead.`,
        })
      },
    }
  },
}

const noDomQueries = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow document.querySelector/querySelectorAll in test files. Use get/query from tests/web/dom.ts.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') {
          return
        }

        if (
          node.callee.object?.type !== 'Identifier' ||
          node.callee.object.name !== 'document'
        ) {
          return
        }

        if (node.callee.property?.type !== 'Identifier') {
          return
        }

        if (
          node.callee.property.name !== 'querySelector' &&
          node.callee.property.name !== 'querySelectorAll'
        ) {
          return
        }

        context.report({
          node,
          message: `Use get/query from tests/web/dom.ts instead of document.${node.callee.property.name}.`,
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
    'no-dom-queries': noDomQueries,
  },
}

export default plugin
