package ingest

// Importação do resultado da AVD exportado da TeamGuide.
//
// A TeamGuide é a fonte da verdade corporativa da avaliação, e o sistema a
// trata como **somente leitura**: nada aqui escreve lá. O que esta importação
// traz é o que os rascunhos locais não têm e nunca teriam.
//
// O principal é a **autoavaliação**. Os rascunhos registram a leitura do
// líder; a nota que a pessoa deu a si mesma só existe na ferramenta. E é o gap
// entre as duas que carrega o sinal: alguém que se dá 4 em todos os drivers
// contra 3 do líder não tem um problema de nota, tem um problema de
// alinhamento de expectativa — e descobrir isso na mesa de calibragem é
// descobrir no momento mais caro possível.
//
// O arquivo é gerado a partir da sessão autenticada do coordenador no
// navegador. Não há credencial guardada aqui, e não há chamada de rede: a
// ingestão lê um arquivo da pasta, como tudo o mais.

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// PacoteTeamGuide é o export de um ciclo.
type PacoteTeamGuide struct {
	Ciclo        string            `json:"ciclo"`
	AssessmentID int64             `json:"assessmentId"`
	Lider        string            `json:"lider"`
	GeradoEm     string            `json:"geradoEm"`
	Pessoas      []PessoaTeamGuide `json:"pessoas"`
}

type PessoaTeamGuide struct {
	Participant int64               `json:"participant"`
	EmployeeID  int64               `json:"employeeId"`
	Nome        string              `json:"nome"`
	Cargo       string              `json:"cargo"`
	Times       []string            `json:"times"`
	Admissao    string              `json:"admissao"`
	Categorias  []CategoriaTG       `json:"categorias"`
	Criterios   []CriterioTeamGuide `json:"criterios"`
}

type CategoriaTG struct {
	Nome  string   `json:"nome"`
	Lider *float64 `json:"lider"`
	Self  *float64 `json:"self"`
	Media *float64 `json:"media"`
}

// CriterioTeamGuide é um driver ou uma pergunta aberta.
//
// `Eixo` e `Ordem` são postos no export a partir do mapa do ciclo, e não
// inferidos aqui: a TeamGuide numera os critérios num contador global do
// formulário (12 a 27 neste ciclo), que não serve de chave para nada e muda a
// cada ciclo. O eixo verdadeiro vem de `nineBoxAxis`.
type CriterioTeamGuide struct {
	Ord         int            `json:"ord"`
	Eixo        string         `json:"eixo"` // comportamento · desempenho · aberta
	Ordem       int            `json:"ordem"`
	Formato     string         `json:"formato"`
	Categoria   string         `json:"categoria"`
	Texto       string         `json:"texto"`
	NotaLider   *int           `json:"notaLider"`
	NotaSelf    *int           `json:"notaSelf"`
	Comentarios []ComentarioTG `json:"comentarios"`
}

type ComentarioTG struct {
	AutorID int64  `json:"autorId"`
	DeQuem  string `json:"deQuem"` // lider · auto
	Texto   string `json:"texto"`
}

// Comentario devolve o texto escrito por quem se pede.
func (c CriterioTeamGuide) Comentario(deQuem string) string {
	for _, k := range c.Comentarios {
		if k.DeQuem == deQuem {
			return strings.TrimSpace(k.Texto)
		}
	}
	return ""
}

// ParseTeamGuide lê o export.
//
// Recusa pacote sem ciclo ou sem pessoas: um arquivo truncado pela metade
// produziria uma importação parcial silenciosa, e metade de um ciclo de AVD no
// banco é pior que nenhum — a calibragem sairia com gente faltando sem aviso.
func ParseTeamGuide(r io.Reader) (*PacoteTeamGuide, error) {
	var p PacoteTeamGuide
	if err := json.NewDecoder(r).Decode(&p); err != nil {
		return nil, fmt.Errorf("json inválido: %w", err)
	}
	if strings.TrimSpace(p.Ciclo) == "" {
		return nil, fmt.Errorf("sem nome de ciclo")
	}
	if len(p.Pessoas) == 0 {
		return nil, fmt.Errorf("sem pessoas no pacote")
	}
	for i, pe := range p.Pessoas {
		if strings.TrimSpace(pe.Nome) == "" {
			return nil, fmt.Errorf("pessoa %d sem nome", i+1)
		}
		if len(pe.Criterios) == 0 {
			return nil, fmt.Errorf("%s: sem critérios", pe.Nome)
		}
	}
	return &p, nil
}

// MediaDe devolve a média do eixo na leitura pedida.
func (p PessoaTeamGuide) MediaDe(eixo, deQuem string) *float64 {
	alvo := "Comportamento"
	if eixo == "desempenho" {
		alvo = "Desempenho"
	}
	for _, c := range p.Categorias {
		if !strings.EqualFold(c.Nome, alvo) {
			continue
		}
		if deQuem == "auto" {
			return c.Self
		}
		return c.Lider
	}
	return nil
}
